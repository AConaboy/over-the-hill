import { expect, type Page } from "@playwright/test";

/** Collects page errors and server errors (5xx) while a test runs; call
 * the returned check at the end. */
export function watchForErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
  });
  return () => expect(errors, errors.join("\n")).toEqual([]);
}

/** Nothing wider than the screen (no sideways scrolling on a phone). */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export const PHONE = { width: 390, height: 844 };
export const LAPTOP = { width: 1280, height: 800 };
