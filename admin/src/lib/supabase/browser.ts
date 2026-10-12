import { createBrowserClient } from "@supabase/ssr";

export function browserClient() {
  return createBrowserClient(process.env.PB_SUPABASE_URL!, process.env.PB_SUPABASE_PUBLISHABLE_KEY!);
}
