import { expect, test, type Page } from "@playwright/test";
import { sql } from "../db";
import { expectNoSidewaysScroll, PHONE, watchForErrors } from "./helpers";

// A6: the hosts' guest list, invites and guest pages. (In dev, admin needs
// no login.) Searches for "Qatest" keep to the QA guests, whatever else is
// in the local database.
test.describe.configure({ mode: "serial" });
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

// a previous failed run's test wording for the "deposit due" email
const CLEAR_TEST_WORDING = `delete from content_fields where page_slug = 'email:deposit-due'
  and exists (select 1 from content_fields where page_slug = 'email:deposit-due' and value like '%Qatest%')`;

const names = (page: Page) => page.locator(".admin-guest-name").allInnerTexts();
const row = (page: Page, name: string) => page.locator(".admin-guests tbody tr", { hasText: name });

test("search and filters, alone and together", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  await page.goto("/admin?q=Qatest");
  expect(await names(page)).toHaveLength(9);
  await page.goto("/admin?q=Qatest&kind=notSent");
  expect(await names(page)).toEqual(["QA Unsent Qatest"]);
  await page.goto("/admin?q=Qatest&phase=2");
  expect((await names(page)).sort()).toEqual(["QA Due Qatest", "QA Opened Qatest"]);
  await page.goto("/admin?q=Qatest&kind=unopened");
  expect((await names(page)).sort()).toEqual(["QA Expired Qatest", "QA Sent Qatest"]);
  await page.goto("/admin?q=Qatest&kind=waiting");
  expect(await names(page)).toEqual(["QA Opened Qatest"]);
  await page.goto("/admin?q=QATEST02");
  expect(await names(page)).toEqual(["QA Due Qatest"]);
  await page.goto("/admin?q=no-such-guest-at-all");
  await expect(page.getByText("No guests match.")).toBeVisible();
  checkErrors();
});

test("headline numbers open the list filtered to them", async ({ page }) => {
  await page.goto("/admin");
  const stat = page.locator(".admin-stat", { hasText: "Not sent yet" });
  const count = Number(await stat.locator(".admin-stat-count").innerText());
  await Promise.all([page.waitForNavigation(), stat.click()]);
  await expect(page.locator(".admin-stat.is-current")).toContainText("Not sent yet");
  await expect(page.locator(".admin-resultline")).toContainText(`${count} guest`);
});

test("status badges: not opened yet, opened with its date, expired", async ({ page }) => {
  await page.goto("/admin?q=Qatest");
  await expect(row(page, "QA Sent Qatest").locator(".admin-status")).toContainText("Not opened yet");
  await expect(row(page, "QA Opened Qatest").locator(".badge")).toHaveText(/^Opened \d+ \w+$/);
  await expect(row(page, "QA Expired Qatest").locator(".admin-status")).toContainText("Link expired");
  await expect(row(page, "QA Due Qatest").locator(".badge")).toHaveText("Payment due");
  await expect(row(page, "QA Cancelled Qatest").locator(".badge")).toHaveText("Cancelled");
});

test("Copy message copies the invite and ticks Sent, without reloading", async ({ page }) => {
  await page.goto("/admin?q=QA%20Unsent%20Qatest");
  let reloaded = false;
  page.on("framenavigated", () => (reloaded = true));
  const guest = row(page, "QA Unsent Qatest");
  await guest.getByRole("button", { name: "Copy message" }).click();
  await expect(guest.locator(".sent-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(guest.locator(".badge")).toHaveText(/^Sent /);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Hi QA! You're invited to Over the Hill, 13–15 August 2027 at Out to Grass\. Here's your personal link to RSVP: http\S+\/rsvp\/qa-token-unsent$/);
  expect(reloaded).toBe(false);
  expect(sql("select 1 from guests where id = 'qa-unsent' and invite_sent_at is not null")).toHaveLength(1);
});

test("the Sent tick box saves in place and the page doesn't jump", async ({ page }) => {
  await page.goto("/admin?q=QA%20Unsent%20Qatest");
  const toggle = row(page, "QA Unsent Qatest").locator(".sent-toggle");
  let reloaded = false;
  page.on("framenavigated", () => (reloaded = true));
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(reloaded).toBe(false);
  await expect.poll(() => sql("select 1 from guests where id = 'qa-unsent' and invite_sent_at is null").length).toBe(1);
  await page.reload();
  await expect(row(page, "QA Unsent Qatest").locator(".sent-toggle")).toHaveAttribute("aria-pressed", "false");
});

test("Copy link copies just their link and ticks Sent", async ({ page }) => {
  await page.goto("/admin?q=QA%20Unsent%20Qatest");
  const guest = row(page, "QA Unsent Qatest");
  await guest.getByRole("button", { name: "Copy link" }).click();
  await expect(guest.locator(".sent-toggle")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^http\S+\/rsvp\/qa-token-unsent$/);
});

test("adding a guest", async ({ page }) => {
  await page.goto("/admin/guests/new");
  await page.fill("#name", "QA Added Qatest");
  await page.fill("#inviterNames", "QA-Host-C");
  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form button[type=submit]").click()]);
  await page.goto("/admin?q=QA%20Added%20Qatest");
  await expect(row(page, "QA Added Qatest")).toContainText("QA-Host-C");
});

test("editing a guest records it in their history, and shows when their link works until", async ({ page }) => {
  await page.goto("/admin/guests/qa-sent/edit");
  await expect(page.locator("#invite")).toContainText("Their link works until");
  await page.goto("/admin/guests/qa-due/edit");
  await expect(page.locator("#invite")).not.toContainText("works until");     // replied: never expires
  await page.selectOption("#invitePhase", "3");
  await page.selectOption("#arrivalDay", "sat");
  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form").first().locator("button[type=submit]").click()]);
  await page.goto("/admin/guests/qa-due/edit");
  await expect(page.locator(".admin-history li").first()).toContainText(/Changed .*(arrival|phase)/);
  expect(sql<{ invite_phase: string; arrival_day: string }>("select invite_phase, arrival_day from guests where id = 'qa-due'")[0])
    .toEqual({ invite_phase: "3", arrival_day: "sat" });
});

test("regenerating a link stops the old one working", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/admin/guests/qa-no/edit");
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Regenerate link" }).click()]);
  const token = sql<{ token: string }>("select token from guests where id = 'qa-no'")[0].token;
  expect(token).not.toBe("qa-token-no");
  await page.goto(`/rsvp/${token}`);
  await expect(page.getByRole("heading", { name: "You've told us you can't make it" })).toBeVisible();
  await page.goto("/rsvp/qa-token-no");
  await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();
});

test("the 'nothing paid yet' filter, and the payments page's stage guide and payment-due emails", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  // the QA guest who said yes but hasn't paid; the one who paid a deposit isn't listed
  await page.goto("/admin?q=Qatest&kind=nothingPaid");
  expect(await names(page)).toContain("QA Due Qatest");
  expect(await names(page)).not.toContain("QA Yes Qatest");
  await page.goto("/admin/payments");
  await expect(page.getByText("What each stage looks like:")).toBeVisible();
  // no Stripe locally, so nobody can pay anything: no button to email them
  await expect(page.getByRole("heading", { name: "Tell guests a payment is due" })).toBeVisible();
  await expect(page.getByText(/Nobody coming has anything to pay right now/)).toBeVisible();
  checkErrors();
});

test("emails: edit, preview unsaved changes, save, reset, and send a test", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  sql(CLEAR_TEST_WORDING);
  await page.goto("/admin/emails");
  await expect(page.getByRole("row", { name: /Your deposit is due/ })).toContainText("Default");
  await page.getByRole("link", { name: "Edit Your deposit is due" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Email: Your deposit is due");

  // the preview shows the saved (default) wording
  const preview = page.frameLocator("iframe[name=email-preview]");
  await expect(preview.getByText("Hi Sam Example,")).toBeVisible();
  await expect(preview.getByText(/We're now taking deposits\. Please pay/)).toBeVisible();

  // "Preview changes" shows the unsaved wording, with placeholders filled in
  await page.fill("#field-body", "Hello {first_name}, your {amount} deposit is due. Qatest wording.");
  await page.getByRole("button", { name: "Preview changes" }).click();
  await expect(preview.getByText(/Hello Sam, your £\d+(\.\d\d)? deposit is due\. Qatest wording\./)).toBeVisible();

  // save: the list says it's their own wording; reset puts it back
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Save", exact: true }).click()]);
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(preview.getByText(/Qatest wording/)).toBeVisible();
  await page.goto("/admin/emails");
  await expect(page.getByRole("row", { name: /Your deposit is due/ })).toContainText("Your own");
  await page.goto("/admin/emails/deposit-due");
  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Reset to the default wording" }).click()]);
  await expect(page.locator("#field-body")).toHaveValue(/We're now taking deposits/);

  // a test email (Resend's test address: accepted, never delivered). Whether
  // Resend accepts it depends on this machine's API key, so either outcome
  // must be said clearly on the page.
  await page.fill("#test-to", "delivered@resend.dev");
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Send test email" }).click()]);
  await expect(
    page.getByRole("status").filter({ hasText: "Sent a test to delivered@resend.dev" })
      .or(page.getByRole("alert").filter({ hasText: "The test couldn't be sent" })),
  ).toBeVisible();
  // a mistyped address is caught before anything is sent (the browser
  // checks it too, so post it directly)
  const origin = new URL(page.url()).origin;
  const response = await page.request.post("/api/admin/emails/deposit-due/test", { form: { to: "sam@" }, headers: { Origin: origin }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(response.headers()["location"]).toContain("testerror=address");
  checkErrors();
});

test("on a phone: the list is cards, nothing scrolls sideways, and the menu works", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/admin?q=Qatest");
  await expectNoSidewaysScroll(page);
  await page.locator(".menu-button").click();
  await expect(page.getByRole("link", { name: "Import" })).toBeVisible();
  await expect(page.locator("[aria-current=page]")).toHaveText("Guests");
});
