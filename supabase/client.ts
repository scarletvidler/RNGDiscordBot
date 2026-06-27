import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.ts";

let adminClient: SupabaseClient<Database> | undefined;
let warnedMissingConfig = false;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && getSupabaseSecretKey());
}

export function getSupabaseAdmin(): SupabaseClient<Database> | undefined {
  const url = process.env.SUPABASE_URL;
  const key = getSupabaseSecretKey();

  if (!url || !key) {
    warnMissingConfig("SUPABASE_URL and SUPABASE_SECRET_KEY");
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

function warnMissingConfig(required: string): void {
  if (warnedMissingConfig) return;
  warnedMissingConfig = true;
  console.warn(`Supabase is not configured. Missing ${required}.`);
}

function getSupabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY;
}
