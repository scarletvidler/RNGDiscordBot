import { getSupabaseAnon } from "./client.ts";

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
) {
  const supabase = getSupabaseAnon();
  if (!supabase) throw new Error("Supabase auth client is not configured.");

  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  });
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseAnon();
  if (!supabase) throw new Error("Supabase auth client is not configured.");

  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = getSupabaseAnon();
  if (!supabase) throw new Error("Supabase auth client is not configured.");

  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const supabase = getSupabaseAnon();
  if (!supabase) throw new Error("Supabase auth client is not configured.");

  return supabase.auth.getUser();
}
