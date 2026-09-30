import { expect, test } from "@playwright/test";
import { sql } from "../db";

// A9: the butterfly and flowers, reduced motion, the payment celebration,
// and accessibility basics.
test.describe.configure({ mode: "serial" });

const butterflyPosition = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (document.querySelector(".butterfly-layer > *") as HTMLElement | null)?.style.transform ?? null);

test("the butterfly flies in and moves", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".butterfly-layer")).toHaveCount(1);
  const first = await butterflyPosition(page);
  await page.waitForTimeout(1500);
  expect(await butterflyPosition(page)).not.toBe(first);
});

test("with reduced motion, nothing moves", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await page.goto("/");
  await page.waitForTimeout(500);
  const first = await butterflyPosition(page);
  await page.waitForTimeout(1500);
  expect(await butterflyPosition(page)).toBe(first);
});

test("the payment celebration plays once, and never with reduced motion", async ({ browser }) => {
  sql("update guests set checkout_session_id = null, amount_paid_pence = 2000 where id = 'qa-yes'");
  const count = async (reducedMotion: "reduce" | "no-preference") => {
    const context = await browser.newContext({ reducedMotion });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const stored = Number(sessionStorage.getItem("qa-celebrations") ?? "0");
      document.addEventListener("overthehill:celebrate", () => sessionStorage.setItem("qa-celebrations", String(stored + 1)));
    });
    await page.goto("/rsvp/qa-token-yes?paid=1");
    await page.waitForTimeout(6000);                     // flies in, lands, then celebrates
    await page.reload();
    await page.waitForTimeout(6000);
    const result = await page.evaluate(() => Number(sessionStorage.getItem("qa-celebrations") ?? "0"));
    await context.close();
    return result;
  };
  expect(await count("no-preference")).toBe(1);
  expect(await count("reduce")).toBe(0);
});

test("every form field has a label, and every page one main heading", async ({ page }) => {
  for (const path of ["/", "/location", "/rsvp", "/rsvp/qa-token-yes?edit=1", "/admin", "/admin/guests/new", "/admin/import", "/admin/checkin", "/admin/report"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} loads`).toBe(200);
    // the page's own headings (not the dev toolbar's, which Playwright's locators would also find)
    expect(await page.evaluate(() => document.querySelectorAll("h1").length), `${path}: one h1`).toBe(1);
    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
        .filter((field) => !(field.id && document.querySelector(`label[for="${field.id}"]`)) && !field.getAttribute("aria-label") && !field.closest("label"))
        .map((field) => field.outerHTML.slice(0, 80)),
    );
    expect(unlabelled, `${path}: unlabelled fields`).toEqual([]);
  }
});
