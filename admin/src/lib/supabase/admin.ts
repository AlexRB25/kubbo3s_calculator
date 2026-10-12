import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/**
 * Server-only client that uses the secret key and bypasses RLS. Only call it after
 * requireAdmin(). Never import this from a client component.
 */
export function admin(): SupabaseClient {
  const url = process.env.PB_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Faltan PB_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
  return (client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

/** Unwraps a Supabase result, throwing on error so failures are never mistaken for "no rows". */
export function must<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
