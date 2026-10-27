import { adminClient, mercadoPago, MODEL_REFERENCE, paymentsConfigured, UUID } from "@/lib/server";

/**
 * Starts the Mercado Pago checkout of a model purchase made with buy_model(). Body: {"purchase_id"}.
 * The price comes from the purchase saved in the database, and only its buyer can pay it.
 */
export async function POST(request: Request) {
  if (!paymentsConfigured()) return Response.json({ error: "El pago en línea no está configurado todavía." }, { status: 503 });

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await adminClient().auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return Response.json({ error: "Entra a tu cuenta para comprar." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const purchaseId = String(body?.purchase_id ?? "");
  if (!UUID.test(purchaseId)) return Response.json({ error: "Compra inválida." }, { status: 400 });

  const { data: purchase, error } = await adminClient()
    .from("model_purchases")
    .select("id, model_id, title, price, status")
    .eq("id", purchaseId)
    .eq("buyer_id", auth.user.id)
    .maybeSingle();
  if (error) return Response.json({ error: "No pudimos leer tu compra." }, { status: 502 });
  if (!purchase) return Response.json({ error: "No encontramos esa compra." }, { status: 404 });
  if (purchase.status !== "pending") return Response.json({ error: "Esta compra ya no está pendiente de pago." }, { status: 409 });

  const origin = process.env.SITE_URL || new URL(request.url).origin;
  const back = `${origin}/modelos/compra?id=${purchase.id}`;
  const response = await mercadoPago("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [{ id: purchase.model_id, title: `Modelo 3D: ${purchase.title}`.slice(0, 250), quantity: 1, unit_price: Number(purchase.price), currency_id: "MXN" }],
      payer: { email: auth.user.email },
      external_reference: `${MODEL_REFERENCE}${purchase.id}`,
      statement_descriptor: "KUBBO3D",
      back_urls: { success: back, pending: back, failure: back },
      // Same as store orders: automatic return and notifications only work on public https addresses.
      ...(origin.startsWith("https://") ? { auto_return: "approved", notification_url: `${origin}/api/mercadopago/webhook` } : {}),
    }),
  });
  if (!response.ok) {
    console.error("Mercado Pago rechazó la preferencia del modelo:", response.status, await response.text());
    return Response.json({ error: "No pudimos iniciar el pago." }, { status: 502 });
  }
  const preference = await response.json();
  return Response.json({ url: preference.init_point });
}
