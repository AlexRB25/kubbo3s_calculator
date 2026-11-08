import { createClient } from "@supabase/supabase-js";
import { loadRates } from "@/lib/currency";
import { adminClient, createCheckout, paymentsConfigured, UUID } from "@/lib/server";
import { chargeCurrency } from "@/lib/stripe";

/**
 * Starts the Stripe checkout of a pack of scans. Body: {"pack_id", "currency"}. The pending purchase is made
 * with the buyer's own session (buy_scans() checks the active subscription and sets the price); the price is
 * in dollars and is charged in the buyer's currency at today's rate.
 */
export async function POST(request: Request) {
  if (!paymentsConfigured()) return Response.json({ error: "El pago en línea no está configurado todavía." }, { status: 503 });
  const url = process.env.PB_SUPABASE_URL!;
  const key = process.env.PB_SUPABASE_PUBLISHABLE_KEY!;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await adminClient().auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return Response.json({ error: "Entra a tu cuenta para comprar." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const packId = String(body?.pack_id ?? "");
  if (!UUID.test(packId)) return Response.json({ error: "Paquete inválido." }, { status: 400 });

  const asUser = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: purchaseId, error } = await asUser.rpc("buy_scans", { p_pack: packId });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  const { data: purchase } = await adminClient().from("scan_purchases").select("id, scans, price_usd").eq("id", purchaseId).single();
  if (!purchase) return Response.json({ error: "No pudimos crear la compra." }, { status: 502 });

  // Checkout charges from Mexican pesos: the dollars of the pack in pesos at today's rate.
  const rates = await loadRates();
  const mxn = Math.round((Number(purchase.price_usd) / (rates.USD || 0.053)) * 100) / 100;
  const origin = process.env.SITE_URL || new URL(request.url).origin;
  const checkout = await createCheckout({
    kind: "scans",
    id: purchase.id,
    email: auth.user.email,
    lines: [{ name: `Kubbo3D: paquete de ${purchase.scans} escaneos 3D`, mxn, quantity: 1 }],
    currency: chargeCurrency(body?.currency),
    back: `${origin}/app/escaner`,
  });
  return checkout ? Response.json({ url: checkout }) : Response.json({ error: "No pudimos iniciar el pago." }, { status: 502 });
}
