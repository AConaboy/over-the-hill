import { expect, test } from "@playwright/test";
import { sql } from "../db";
import { expectNoSidewaysScroll, PHONE, watchForErrors } from "./helpers";

// A5: a guest's journey, from their link to replying.
test.describe.configure({ mode: "serial" });

test("the calendar file is right, and fetching it doesn't count as opening the invite", async ({ request }) => {
  const response = await request.get("/rsvp/qa-token-sent/calendar.ics");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/calendar");
  const ics = await response.text();
  expect(ics).toContain("DTSTART;VALUE=DATE:20270813");
  expect(ics).toContain("DTEND;VALUE=DATE:20270816");
  expect(ics).toContain("LOCATION:Out to Grass\\, Woodend Farm\\, Cradley\\, WR13 5JW");
  expect(sql<{ status: string }>("select status from guests where id = 'qa-sent'")[0].status).toBe("invited");
});

test("opening the invite shows the poster and records that they opened it", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  await page.setViewportSize(PHONE);
  await page.goto("/rsvp/qa-token-sent");
  await expect(page.locator(".poster-illustration")).toBeVisible();
  await expect(page.getByText(/QA, you are invited to/i).first()).toBeVisible();
  await expectNoSidewaysScroll(page);
  expect(sql<{ status: string }>("select status from guests where id = 'qa-sent'")[0].status).toBe("viewed");
  expect(sql("select 1 from guest_events where guest_id = 'qa-sent' and action = 'opened'")).toHaveLength(1);
  checkErrors();
});

test("the RSVP form: days with dates, lift share fields, and replying yes", async ({ page }) => {
  const checkErrors = watchForErrors(page);
  await page.goto("/rsvp/qa-token-sent?edit=1");
  await expect(page.locator("#arrivalDay option")).toHaveText([
    "Please select", "Thursday 12 August", "Friday 13 August", "Saturday 14 August", "Sunday 15 August", "Monday 16 August", "Not sure yet",
  ]);

  await page.selectOption("#attendance", "yes");
  await page.selectOption("#arrivalDay", "fri");
  await page.selectOption("#departureDay", "sun");

  // "From where?" once a lift is chosen; "Spare seats" only when offering
  await expect(page.locator("#liftFrom")).toBeHidden();
  await page.selectOption("#lift", "need");
  await expect(page.locator("#liftFrom")).toBeVisible();
  await expect(page.locator("#liftSeats")).toBeHidden();
  await page.selectOption("#lift", "offer");
  await expect(page.locator("#liftSeats")).toBeVisible();
  await page.fill("#liftFrom", "Bath");
  await page.fill("#liftSeats", "2");

  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form button[type=submit]").click()]);
  const answers = page.locator(".flower-list");
  await expect(answers).toContainText("Arrival day: Friday 13 August");
  await expect(answers).toContainText("Departure day: Sunday 15 August");
  await expect(answers).toContainText("Lift share: Can offer a lift from Bath (2 spare seats)");
  await expect(page.getByRole("heading", { name: /follow us/i })).toBeVisible();
  expect(sql<{ attendance: string }>("select attendance from guests where id = 'qa-sent'")[0].attendance).toBe("yes");
  checkErrors();
});

test("editing answers changes only what was changed", async ({ page }) => {
  await page.goto("/rsvp/qa-token-sent");
  await Promise.all([page.waitForNavigation(), page.getByRole("link", { name: "Edit your response" }).click()]);
  await page.selectOption("#departureDay", "mon");
  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form button[type=submit]").click()]);
  await expect(page.locator(".flower-list")).toContainText("Departure day: Monday 16 August");
  await expect(page.locator(".flower-list")).toContainText("Arrival day: Friday 13 August");
});

test("replying no", async ({ page }) => {
  await page.goto("/rsvp/qa-token-unsent?edit=1");
  await page.selectOption("#attendance", "no");
  await Promise.all([page.waitForNavigation(), page.locator("form.rsvp-form button[type=submit]").click()]);
  await expect(page.getByRole("heading", { name: "You've told us you can't make it" })).toBeVisible();
});

test("an expired link and a made-up link get friendly pages", async ({ page }) => {
  await page.goto("/rsvp/qa-token-expired");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await page.goto("/rsvp/qa-token-not-a-real-one");
  await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();
});

test("a guest can have their link emailed to them", async ({ page }) => {
  await page.goto("/rsvp");
  await page.fill("#email", "delivered@resend.dev");
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Email me my link" }).click()]);
  expect(new URL(page.url()).searchParams.get("sent")).toBe("1");
});
