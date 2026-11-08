import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/server";
import { stripe } from "@/lib/stripe";

/** Buckets where a user's files live, each under a folder named with their id. */
const BUCKETS = ["products", "user-files", "model-media", "model-files", "equipment", "bug-reports"];

/** Every file under `prefix` in a bucket, going into its folders. */
async function filesUnder(db: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const found: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Folders come without an id.
      if (item.id) found.push(path);
      else found.push(...(await filesUnder(db, bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return found;
}

/**
 * Deletes the signed-in user's account and everything in it, for good (stores require it from inside the
 * app). Header "Authorization: Bearer <access token>", body {"confirm": "ELIMINAR"}. In order: their Stripe
 * subscription stops now, their files go, and deleting the user removes their rows (every table hangs from
 * auth.users with on delete cascade or set null). Someone who sold models is sent to support instead, so the
 * buyers do not lose them.
 */
export async function POST(request: Request) {
  const url = process.env.PB_SUPABASE_URL;
  const key = process.env.PB_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !process.env.SUPABASE_SECRET_KEY) return Response.json({ error: "Falta configurar Supabase en el servidor." }, { status: 503 });
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Entra a tu cuenta para eliminarla." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.confirm !== "ELIMINAR") return Response.json({ error: "Escribe ELIMINAR para confirmar." }, { status: 400 });

  const session = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await session.auth.getUser(token);
  const user = who.user;
  if (!user) return Response.json({ error: "Tu sesión caducó: vuelve a entrar." }, { status: 401 });

  const db = adminClient();

  const sold = await db.from("model_purchases").select("id", { count: "exact", head: true }).eq("seller_id", user.id).eq("status", "paid");
  if (sold.error) return Response.json({ error: "No se pudo revisar tu cuenta. Intenta de nuevo." }, { status: 502 });
  if ((sold.count ?? 0) > 0) {
    return Response.json(
      {
        error:
          "Vendiste modelos en el marketplace: para no quitárselos a quienes los compraron, tu cuenta se cierra a mano. Escríbenos a soporte@kubbo3d.com desde este correo y la eliminamos en menos de 30 días.",
      },
      { status: 409 },
    );
  }

  // The plan stops now, so it is never charged again.
  const subscriptions = await db
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .eq("source", "stripe")
    .in("status", ["authorized", "paused", "pending"]);
  if (subscriptions.error) return Response.json({ error: "No se pudo leer tu suscripción. Intenta de nuevo." }, { status: 502 });
  for (const { stripe_subscription_id: id } of subscriptions.data) {
    if (!id || !process.env.STRIPE_SECRET_KEY) continue;
    const cancel = await stripe(`/subscriptions/${id}`, undefined, "DELETE");
    // Already cancelled (404) is fine; anything else stops here so nobody is charged without an account.
    if (!cancel.ok && cancel.status !== 404) return Response.json({ error: "Stripe no respondió al cancelar tu plan. Intenta de nuevo en un momento." }, { status: 502 });
  }

  for (const bucket of BUCKETS) {
    const paths = await filesUnder(db, bucket, user.id);
    for (let start = 0; start < paths.length; start += 100) await db.storage.from(bucket).remove(paths.slice(start, start + 100));
  }

  const deleted = await db.auth.admin.deleteUser(user.id);
  if (deleted.error) return Response.json({ error: `No se pudo eliminar la cuenta: ${deleted.error.message}` }, { status: 500 });
  return Response.json({ ok: true });
}
