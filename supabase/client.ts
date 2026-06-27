import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.ts";

let adminClient: SupabaseClient<Database> | undefined;
let anonClient: SupabaseClient<Database> | undefined;
let warnedMissingConfig = false;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY),
  );
}

export function getSupabaseAdmin(): SupabaseClient<Database> | undefined {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    warnMissingConfig("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    return undefined;
  }

  adminClient ??= createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

export function getSupabaseAnon(): SupabaseClient<Database> | undefined {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    warnMissingConfig("SUPABASE_URL and SUPABASE_ANON_KEY");
    return undefined;
  }

  anonClient ??= createClient<Database>(url, key);
  return anonClient;
}

function warnMissingConfig(required: string): void {
  if (warnedMissingConfig) return;
  warnedMissingConfig = true;
  console.warn(`Supabase is not configured. Missing ${required}.`);
}
