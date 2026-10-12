import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { LAPTOP, PHONE } from "./helpers";

// A12: automated accessibility checks (axe) against WCAG 2.2 A and AA, on
// every page a guest or host sees, at phone and laptop widths. Tools catch
// about a third of problems; the rest are in the manual QA plan.
const PAGES = [
  "/", "/location", "/privacy", "/rsvp", "/rsvp/qa-token-opened", "/rsvp/qa-token-yes", "/rsvp/qa-token-yes?edit=1",
  "/rsvp/qa-token-due", "/rsvp/qa-token-expired", "/rsvp/qa-token-not-real", "/not-a-page",
  "/admin", "/admin/guests/new", "/admin/guests/qa-yes/edit", "/admin/import", "/admin/report", "/admin/checkin",
  "/admin/payments", "/admin/content", "/admin/content/rsvp-form", "/admin/emails", "/admin/emails/deposit-due", "/checkin/QATEST01",
];

for (const [label, size] of [["phone", PHONE], ["laptop", LAPTOP]] as const) {
  for (const path of PAGES) {
    test(`${path} on a ${label} meets WCAG 2.2 AA (axe)`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ reducedMotion: "reduce" });       // a still page, so results are stable
      await page.goto(path);
      // The email preview frame (admin Emails) is sandboxed with no scripts, so
      // axe can't run in it; it shows an email, not the site.
      await page.route("**/api/admin/emails/*/preview", (route) => route.fulfill({ body: "", contentType: "text/html" }));
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .exclude("iframe[name=email-preview]")
        .analyze();
      const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(" ")} — ${n.failureSummary?.split("\n").slice(1).join("; ")}`).join("\n")}`);
      expect(report, report.join("\n\n")).toEqual([]);
    });
  }
}

test("the first Tab reaches 'Skip to main content', which jumps past the header", async ({ page }) => {
  await page.goto("/location");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("'Pause animations' stills everything, and is remembered across pages", async ({ page }) => {
  await page.goto("/rsvp/qa-token-yes");
  const toggle = page.getByRole("button", { name: "Pause animations" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
  await expect(page.getByRole("button", { name: "Play animations" })).toBeVisible();
  await expect(page.locator(".site-logo img")).toHaveAttribute("src", "/images/logo-static.webp");
  const raysStill = await page.evaluate(() => {
    const spin = document.querySelector(".sunrise-rays .spin");
    return !spin || getComputedStyle(spin).animationName === "none";
  });
  expect(raysStill).toBe(true);
  // the butterfly rests: still in the same place a moment later
  const where = () => page.evaluate(() => {
    const layer = document.querySelector(".butterfly-layer .butterfly") as HTMLElement | null;
    return layer ? layer.getBoundingClientRect().toJSON() : null;
  });
  await page.waitForTimeout(500);
  const before = await where();
  await page.waitForTimeout(1500);
  expect(await where()).toEqual(before);

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "paused");
  await page.getByRole("button", { name: "Play animations" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-motion", "paused");
});

test("with the device's reduced-motion setting, the pause button isn't needed and is hidden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("[data-motion-toggle]")).toBeHidden();
});

test("pages reflow at 320px wide (400% zoom) without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ["/", "/location", "/privacy", "/rsvp", "/rsvp/qa-token-opened", "/rsvp/qa-token-yes"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
});
