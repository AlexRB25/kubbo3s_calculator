import { chargeCurrency } from "@/lib/stripe";
import { adminClient, createCheckout, paymentsConfigured, UUID } from "@/lib/server";

/**
 * Starts the Stripe checkout of a model purchase made with buy_model(). Body: {"purchase_id", "currency"}.
 * The price comes from the purchase saved in the database (Mexican pesos), and only its buyer can pay it.
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
  const url = await createCheckout({
    kind: "model",
    id: purchase.id,
    email: auth.user.email,
    lines: [{ name: `Modelo 3D: ${purchase.title}`, mxn: Number(purchase.price), quantity: 1 }],
    currency: chargeCurrency(body?.currency),
    back: `${origin}/modelos/compra?id=${purchase.id}`,
  });
  return url ? Response.json({ url }) : Response.json({ error: "No pudimos iniciar el pago." }, { status: 502 });
}
