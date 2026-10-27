import { createClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/server";

/**
 * The shop's owner invites someone by email. Header "Authorization: Bearer <access token>", body
 * {"email", "role": "admin" | "staff"}. The invitation is saved with the owner's own session (the database
 * checks it is their shop and that their plan has room) and an email goes out with the link:
 *  - a new person gets Supabase's "Invite user" email (creates the account),
 *  - someone who already has an account gets a sign-in link,
 * both landing on /invitacion. The link also comes back, to share it by WhatsApp if the email is late.
 */
export async function POST(request: Request) {
  const url = process.env.PB_SUPABASE_URL;
  const key = process.env.PB_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Falta configurar Supabase." }, { status: 503 });
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Entra a tu cuenta para invitar." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = body?.role === "admin" ? "admin" : "staff";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Escribe un correo válido." }, { status: 400 });

  // As the owner: RLS only lets them invite to their own shop; the trigger checks the plan's seats.
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who } = await db.auth.getUser(token);
  if (!who.user) return Response.json({ error: "Tu sesión caducó: vuelve a entrar." }, { status: 401 });
  const { data: shop } = await db.rpc("my_shop");
  if (shop?.role !== "owner") return Response.json({ error: "Solo el dueño de la tienda puede invitar. Cambia a tu tienda para invitar a la tuya." }, { status: 403 });

  const { data: invite, error } = await db.from("shop_invites").insert({ email, role }).select("token").single();
  if (error) {
    const message = error.code === "23505" ? "Ya hay una invitación pendiente para ese correo." : error.message;
    return Response.json({ error: message }, { status: 400 });
  }

  const site = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const link = `${site}/invitacion?token=${invite.token}`;

  // The email: an invitation for someone new, a sign-in link for an existing account.
  let emailed = false;
  let note = "";
  if (process.env.SUPABASE_SECRET_KEY) {
    const sent = await adminClient().auth.admin.inviteUserByEmail(email, { redirectTo: link });
    if (!sent.error) emailed = true;
    else if (/already|registered|exists/i.test(sent.error.message)) {
      const otp = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: link },
      });
      emailed = !otp.error;
      if (otp.error) note = otp.error.message;
    } else note = sent.error.message;
  } else {
    note = "El servidor no tiene SUPABASE_SECRET_KEY para mandar correos.";
  }
  if (note) console.error("Invitación sin correo:", note);
  return Response.json({ link, emailed, note: emailed ? "" : "No se pudo mandar el correo: comparte el enlace por WhatsApp o mensaje." });
}
