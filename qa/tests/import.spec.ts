import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "../db";
import { watchForErrors } from "./helpers";

// A7: importing the invite spreadsheet a phase at a time, and the to-fix
// list. Uses a small made-up sheet in the real one's layout (every name
// starts "Qa", so cleanup can find it): see qa/fixtures/invite-list.csv.
test.describe.configure({ mode: "serial" });

const SHEET = fileURLToPath(new URL("../fixtures/invite-list.csv", import.meta.url));

async function preview(page: Page, csv: string = readFileSync(SHEET, "utf8")) {
  await page.goto("/admin/import");
  await page.setInputFiles("#file", { name: "invite-list.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Preview" }).click()]);
}
async function importPhases(page: Page, phases: string[]) {
  for (const phase of phases) await page.check(`#phase-${phase}`);
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Import", exact: true }).click()]);
}
const guest = (name: string) => sql<{ id: string; invite_phase: string; is_performer: number }>(`select id, invite_phase, is_performer from guests where name = '${name}'`)[0];
const inviters = (name: string) =>
  sql<{ inviter_name: string }>(`select inviter_name from guest_inviters i join guests g on g.id = i.guest_id where g.name = '${name}' order by 1`).map((r) => r.inviter_name);

test("the preview counts each phase, and adds nobody", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  await preview(page);
  const labels = page.locator(".import-phase label");
  await expect(labels.nth(0)).toContainText("Phase 1: 2 to add, 4 to fix later");
  await expect(labels.nth(1)).toContainText("Phase 2: 1 to add, 1 to fix later");
  await expect(page.locator("#phase-3")).toBeDisabled();
  await expect(labels.nth(3)).toContainText("Acts: 1 to add, 1 to fix later");
  expect(sql("select 1 from guests where name glob 'Qa[a-z]* Qatest'")).toHaveLength(0);   // glob: case matters
  checkErrors();
});

test("importing phase 1 adds its clean names; problems go on the to-fix list", async ({ page }) => {
  await preview(page);
  await importPhases(page, ["1"]);
  await expect(page.locator(".notice h2")).toHaveText("Imported 2 guests");
  expect(guest("Qaali Qatest").invite_phase).toBe("1");
  expect(inviters("Qaali Qatest")).toEqual([]);                          // Communal: no inviter
  expect(inviters("Qalisa Qatest")).toEqual(["QA-Host-A", "QA-Host-B"]);  // listed twice: one guest, earlier phase
  expect(guest("Qalisa Qatest").invite_phase).toBe("1");
  expect(guest("Qajaydn Qatest")).toBeUndefined();                       // possible duplicate: held back
  expect(guest("Qabeth Qatest")).toBeUndefined();                        // phase 2: not imported
  const issues = sql<{ kind: string }>("select kind from import_issues where status = 'open' and (source_key like '%qatest%' or source_key like '%|qa%')");
  expect(issues.filter((i) => i.kind === "skipped")).toHaveLength(2);
  expect(issues.filter((i) => i.kind === "duplicate")).toHaveLength(1);
});

test("importing the same sheet again adds nothing twice", async ({ page }) => {
  await preview(page);
  await expect(page.locator(".import-phase label").nth(0)).toContainText("0 to add, 2 already on the list");
  await importPhases(page, ["1", "2", "acts"]);
  expect(sql("select 1 from guests where name = 'Qaali Qatest'")).toHaveLength(1);
  expect(guest("Qaconnor Qatest")).toMatchObject({ invite_phase: "acts", is_performer: 1 });
  expect(sql("select 1 from import_issues where source_key like '%|qa%' or source_key like '%qatest%'")).toHaveLength(5);
});

test("to-fix: adding a missing surname lands on the next item, with the filter kept", async ({ page }) => {
  await page.goto("/admin/import/fix?phase=1");
  const items = page.locator(".fix-item");
  const skipped = items.filter({ hasText: "Qamark" });
  await skipped.locator("input[name=surname]").fill("Qatest");
  const ids = await items.evaluateAll((els) => els.map((el) => el.id));
  const next = ids[ids.indexOf(await skipped.getAttribute("id") ?? "") + 1] ?? ids[ids.indexOf(await skipped.getAttribute("id") ?? "") - 1];
  await Promise.all([page.waitForNavigation(), skipped.getByRole("button", { name: "Add guest" }).click()]);
  expect(new URL(page.url()).searchParams.get("phase")).toBe("1");
  expect(new URL(page.url()).hash).toBe(`#${next}`);
  await expect(page.locator(`#${next} .fix-message`)).toContainText("Added");
  expect(guest("Qamark Qatest").invite_phase).toBe("1");
});

test("to-fix: a name already on the list stays put and says so", async ({ page }) => {
  await page.goto("/admin/import/fix");
  const item = page.locator(".fix-item", { hasText: "Qabrodie" });
  const id = await item.getAttribute("id");
  await item.locator("input[name=surname]").fill("Qatest");
  await item.locator("input[name=first]").fill("Qaali");
  await Promise.all([page.waitForNavigation(), item.getByRole("button", { name: "Add guest" }).click()]);
  expect(new URL(page.url()).hash).toBe(`#${id}`);
  await expect(page.locator(`#${id} .fix-message`)).toContainText("already on the guest list");
});

test("to-fix: the same person becomes one guest with both listings' hosts", async ({ page }) => {
  await page.goto("/admin/import/fix");
  const pair = page.locator(".fix-item", { hasText: "Qajaydn Qatest" });
  await Promise.all([page.waitForNavigation(), pair.getByRole("button", { name: "Same person: “Qajaydn Qatest”" }).click()]);
  expect(guest("Qajaydn Qatest").invite_phase).toBe("1");
  expect(inviters("Qajaydn Qatest")).toEqual(["QA-Host-A", "QA-Host-B"]);
  expect(guest("Qajayden Qatest")).toBeUndefined();
});

test("to-fix: dismiss and reopen, and notes", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/admin/import/fix");
  const item = page.locator(".fix-item", { hasText: "Qaadele" });
  const id = await item.getAttribute("id");
  await item.locator("input[name=note]").fill("Asked QA-Host-A");
  await Promise.all([page.waitForNavigation(), item.getByRole("button", { name: "Save note" }).click()]);
  await expect(page.locator(`#${id} input[name=note]`)).toHaveValue("Asked QA-Host-A");
  await Promise.all([page.waitForNavigation(), page.locator(`#${id}`).getByRole("button", { name: "Not inviting them" }).click()]);
  await expect(page.locator(".fix-item", { hasText: "Qaadele" })).toHaveCount(0);
  // it's now in the Sorted list, which starts closed
  const sorted = page.locator("details", { hasText: "Sorted" });
  if (!(await sorted.evaluate((el) => (el as HTMLDetailsElement).open))) await sorted.locator("summary").click();
  await Promise.all([page.waitForNavigation(), page.locator(`li#${id}`).getByRole("button", { name: "Reopen" }).click()]);
  await expect(page.locator(".fix-item", { hasText: "Qaadele" })).toHaveCount(1);
});

test("to-fix: a name corrected in the sheet is imported and its item marked fixed there", async ({ page }) => {
  await preview(page, readFileSync(SHEET, "utf8").replace("Qabrodie,Smith?", "Qabrodie,Qatest"));
  await importPhases(page, ["1"]);
  expect(guest("Qabrodie Qatest").invite_phase).toBe("1");
  expect(sql<{ status: string; resolution: string }>("select status, resolution from import_issues where source_key like '%qabrodie%'")[0])
    .toEqual({ status: "resolved", resolution: "No longer in the sheet (fixed there)" });
});
