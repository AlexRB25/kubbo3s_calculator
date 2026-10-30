import { chargeCurrency } from "@/lib/stripe";
import { adminClient, createCheckout, paymentsConfigured, UUID } from "@/lib/server";

type OrderItem = { id: string; product_id: string | null; name: string; unit_price: number; quantity: number };

/**
 * Starts the Stripe checkout of a store order. Body: {"order_id": uuid, "currency": "PEN"…}. Amounts come
 * from the order saved by place_order() (in Mexican pesos), never from the browser; the currency only says
 * which one the buyer pays in. Answers {"url"} to redirect to.
 */
export async function POST(request: Request) {
  if (!paymentsConfigured()) return Response.json({ error: "El pago en línea no está configurado." }, { status: 503 });

  const body = await request.json().catch(() => null);
  const orderId = String(body?.order_id ?? "");
  if (!UUID.test(orderId)) return Response.json({ error: "Pedido inválido." }, { status: 400 });

  const { data: order, error } = await adminClient().from("store_orders").select("*, store_order_items(*)").eq("id", orderId).maybeSingle();
  if (error) return Response.json({ error: "No pudimos leer tu pedido." }, { status: 502 });
  if (!order) return Response.json({ error: "No encontramos ese pedido." }, { status: 404 });
  if (order.status !== "pending") return Response.json({ error: "Este pedido ya no está pendiente de pago." }, { status: 409 });

  const lines = (order.store_order_items as OrderItem[]).map((item) => ({ name: item.name, mxn: Number(item.unit_price), quantity: item.quantity }));
  if (Number(order.shipping) > 0) lines.push({ name: "Envío", mxn: Number(order.shipping), quantity: 1 });

  const origin = process.env.SITE_URL || new URL(request.url).origin;
  const url = await createCheckout({
    kind: "order",
    id: order.id,
    email: order.email,
    lines,
    currency: chargeCurrency(body?.currency),
    back: `${origin}/pedido?id=${order.id}`,
  });
  return url ? Response.json({ url }) : Response.json({ error: "No pudimos iniciar el pago." }, { status: 502 });
}
