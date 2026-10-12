import { adminClient, mercadoPago, paymentsConfigured, UUID } from "@/lib/server";

type OrderItem = { id: string; product_id: string | null; name: string; unit_price: number; quantity: number };

/**
 * Starts the Mercado Pago checkout of a store order. Body: {"order_id": uuid}. Amounts come
 * from the order saved by place_order(), never from the browser. Answers {"url"} to redirect to.
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

  const origin = process.env.SITE_URL || new URL(request.url).origin;
  const back = `${origin}/pedido?id=${order.id}`;
  const items = (order.store_order_items as OrderItem[]).map((item) => ({
    id: item.product_id ?? item.id,
    title: item.name,
    quantity: item.quantity,
    unit_price: Number(item.unit_price),
    currency_id: "MXN",
  }));
  if (Number(order.shipping) > 0) {
    items.push({ id: "envio", title: "Envío", quantity: 1, unit_price: Number(order.shipping), currency_id: "MXN" });
  }

  const response = await mercadoPago("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items,
      payer: { name: order.customer_name, email: order.email },
      external_reference: order.id,
      statement_descriptor: "KUBBO3D",
      back_urls: { success: back, pending: back, failure: back },
      // Mercado Pago only accepts automatic return and notifications on public https addresses,
      // so on localhost the buyer comes back with the button and /pedido confirms the payment.
      ...(origin.startsWith("https://") ? { auto_return: "approved", notification_url: `${origin}/api/mercadopago/webhook` } : {}),
    }),
  });
  if (!response.ok) {
    console.error("Mercado Pago rechazó la preferencia:", response.status, await response.text());
    return Response.json({ error: "No pudimos iniciar el pago." }, { status: 502 });
  }
  const preference = await response.json();
  return Response.json({ url: preference.init_point });
}
