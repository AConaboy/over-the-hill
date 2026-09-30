// The local database (the same one `astro dev` and `astro preview` use),
// through wrangler. Only ever the local one: never add --remote here.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function wrangler(args: string[]): string {
  return execFileSync("npx", ["wrangler", "d1", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Runs SQL on the local database and returns the rows of the last statement. */
export function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = wrangler(["execute", "over-the-hill", "--local", "--json", "--command", query]);
  const results = JSON.parse(out) as { results: T[] }[];
  return results.at(-1)?.results ?? [];
}

export function sqlFile(path: string): void {
  wrangler(["execute", "over-the-hill", "--local", "--file", fileURLToPath(new URL(path, import.meta.url))]);
}

export function migrate(): void {
  wrangler(["migrations", "apply", "over-the-hill", "--local"]);
}

/** Removes everything the suite made: QA guests (their inviters, payments
 * and history go with them) and the to-fix items from the test sheet. */
export function cleanUp(): void {
  sqlFile("./cleanup.sql");
}
