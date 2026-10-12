import { redirect } from "next/navigation";
import { serverClient } from "./supabase/server";

const allowed = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

/** Email of the signed-in admin, or null. The session is verified by Supabase Auth, never just decoded. */
export async function currentAdmin(): Promise<string | null> {
  if (!process.env.PB_SUPABASE_URL) return null;
  const { data } = await (await serverClient()).auth.getUser();
  const email = data.user?.email?.toLowerCase();
  return email && allowed().includes(email) ? email : null;
}

/** Gate for every dashboard page and server action. */
export async function requireAdmin(): Promise<string> {
  const email = await currentAdmin();
  if (!email) redirect("/login");
  return email;
}
