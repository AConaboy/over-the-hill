import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

// Server-only. Uses the service role key, which bypasses Row Level Security,
// so this must never be imported from client-side/browser code. All access
// control lives in the query logic in src/lib/guests.ts (look up by token,
// never list guests to an unauthenticated caller), not in RLS policies.
let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}
