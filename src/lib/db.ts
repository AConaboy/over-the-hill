import { env } from "cloudflare:workers";

// Server-only, and only reachable at all from server-side code: D1 has no
// public network endpoint, it's accessible exclusively via this binding.
// All access control lives in the query logic in src/lib/guests.ts (look up
// by token, never list guests to an unauthenticated caller) — there's no
// separate policy layer to configure, unlike a hosted-Postgres setup.
export function getDb(): D1Database {
  return env.DB;
}
