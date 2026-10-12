import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client bound to the visitor's session cookies. Only used to know who is signed in. */
export async function serverClient() {
  const store = await cookies();
  return createServerClient(process.env.PB_SUPABASE_URL!, process.env.PB_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components cannot write cookies; src/proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
