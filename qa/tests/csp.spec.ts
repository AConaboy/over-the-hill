import { expect, test, type Page } from "@playwright/test";
import { LAPTOP, PHONE } from "./helpers";

// A4: the strict Content Security Policy (astro.config.mjs) blocks nothing
// of ours. Public pages are checked on the production build (port 4399),
// which sends the real policy. Admin pages refuse the build without
// Cloudflare Access, so they're checked on the dev server instead, with the
// build's policy attached and the dev server's own tooling scripts taken
// out, so any violation left is ours.
const BUILD = "http://localhost:4399";
const PUBLIC = ["/", "/location", "/rsvp", "/rsvp/qa-token-yes", "/rsvp/qa-token-yes?edit=1", "/rsvp/qa-token-not-real"];
const ADMIN = ["/admin", "/admin?q=Qatest", "/admin/guests/qa-yes/edit", "/admin/guests/new", "/admin/import", "/admin/import/fix",
  "/admin/report", "/admin/checkin?q=Qatest", "/checkin/QATEST01", "/admin/payments", "/admin/content"];

async function violations(page: Page, url: string): Promise<string[]> {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI || "inline"} ${e.sourceFile}:${e.lineNumber}`));
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  return [...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)), ...errors];
}

for (const viewport of [LAPTOP, PHONE]) {
  for (const path of PUBLIC) {
    test(`public ${path} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const response = await page.request.get(BUILD + path);
      expect(response.headers()["content-security-policy"]).toContain("script-src 'self'");
      expect(await violations(page, BUILD + path)).toEqual([]);
    });
  }
}

test("admin pages", async ({ page, request }) => {
  const policy = (await request.get(`${BUILD}/`)).headers()["content-security-policy"];
  expect(policy).toBeTruthy();
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    const html = (await response.text())
      .replace(/<script[^>]*src="\/@[^"]*"[^>]*><\/script>/g, "")          // Vite's client, the dev toolbar
      .replace(/<script>window\.__astro_dev_toolbar__[\s\S]*?<\/script>/g, "");
    await route.fulfill({ response, body: html, headers: { ...response.headers(), "content-security-policy": policy } });
  });
  for (const path of ADMIN) {
    expect(await violations(page, path), path).toEqual([]);
  }
});
