import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { sql } from "../db";
import { PHONE, watchForErrors } from "./helpers";

// A8: the planning report, CSV export, check-in sheet PDF and gate check-in.
// Other guests may be in the local database, so these look for the QA
// guests rather than exact totals (the totals are unit-tested).
test.describe.configure({ mode: "serial" });

test("the report lists the QA guests' needs and lifts", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  await page.goto("/admin/report");
  await expect(page.getByText("QA Yes Qatest: Vegan")).toBeVisible();
  await expect(page.getByText("QA Yes Qatest: Step-free access")).toBeVisible();
  await expect(page.locator(".admin-report")).toContainText("QA Performer Qatest");
  // Bristol and bristol are one place: the offer and the request together
  const bristol = page.locator(".admin-lift-group", { hasText: /QA Yes Qatest/ });
  await expect(bristol).toContainText("QA Yes Qatest can offer a lift (3 seats)");
  await expect(bristol).toContainText("QA Due Qatest would like a lift");
  await expect(page.locator("#check-in")).toContainText("QATEST01");
  checkErrors();
});

test("the CSV has every guest, dates in words, and no formulas", async ({ request }) => {
  const response = await request.get("/api/admin/export.csv");
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toMatch(/attachment; filename="over-the-hill-guests-\d{4}-\d{2}-\d{2}\.csv"/);
  const csv = await response.text();
  expect(csv.startsWith("﻿Name,")).toBe(true);
  const yes = csv.split("\r\n").find((line) => line.startsWith("QA Yes Qatest,"))!;
  expect(yes).toContain("Friday 13 August,Sunday 15 August");
  expect(yes).toContain("I can offer a lift,Bristol,3");
  const performer = csv.split("\r\n").find((line) => line.startsWith("QA Performer Qatest,"))!;
  expect(performer).toContain(`"'=HYPERLINK(""http://example.com"")"`);
});

test("the check-in sheet downloads as an A4 PDF", async ({ page }) => {
  await page.goto("/admin/checkin");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Check-in sheet (PDF)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^over-the-hill-check-in-\d{4}-\d{2}-\d{2}\.pdf$/);
  const pdf = await PDFDocument.load(await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks)));
  expect(pdf.getTitle()).toBe("Over the Hill: check-in sheet");
  const { width, height } = pdf.getPage(0).getSize();
  expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
});

test("checking in at the gate, by search and by ticket link, and undoing it", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/admin/checkin?q=QA%20Yes%20Qatest");
  const card = page.locator(".checkin-card", { hasText: "QA Yes Qatest" });
  await Promise.all([page.waitForNavigation(), card.getByRole("button", { name: "Check in" }).click()]);
  await expect(page.locator(".checkin-card", { hasText: "QA Yes Qatest" })).toContainText("Checked in at");
  expect(sql("select 1 from guests where id = 'qa-yes' and checked_in_at is not null")).toHaveLength(1);
  await Promise.all([page.waitForNavigation(), page.locator(".checkin-card", { hasText: "QA Yes Qatest" }).getByRole("button", { name: "Undo" }).click()]);
  expect(sql("select 1 from guests where id = 'qa-yes' and checked_in_at is null")).toHaveLength(1);

  await page.goto("/checkin/QATEST01");
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Check in" }).click()]);
  await expect(page.locator(".checkin-card")).toContainText("Checked in at");
  await page.getByRole("button", { name: "Undo" }).click();
});

test("someone who isn't coming can't be checked in", async ({ page }) => {
  await page.goto("/checkin/QATEST02");       // deposit due: coming, can check in
  await expect(page.getByRole("button", { name: "Check in" })).toBeEnabled();
  sql("update guests set ticket_ref = 'QATEST09' where id = 'qa-cancelled'");
  await page.goto("/checkin/QATEST09");
  await expect(page.locator(".checkin-card")).toContainText("Place cancelled");
  await expect(page.getByRole("button", { name: "Check in" })).toBeDisabled();
});
