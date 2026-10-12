import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only helpers for charging store orders. Nothing here may be imported from a client component.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the site can charge online; otherwise checkout falls back to manual payment instructions. */
export const paymentsConfigured = () =>
  Boolean(process.env.MP_ACCESS_TOKEN && process.env.SUPABASE_SECRET_KEY && process.env.PB_SUPABASE_URL);

let client: SupabaseClient | undefined;

/** Bypasses RLS: only for reading an order to charge it and marking it paid. */
export function adminClient(): SupabaseClient {
  return (client ??= createClient(process.env.PB_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** Calls the Mercado Pago API with the seller's access token. */
export function mercadoPago(path: string, init?: RequestInit) {
  return fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init?.headers },
  });
}

type ConfirmResult = "paid" | "ignored" | "retry";

/**
 * Asks Mercado Pago about a payment and, if it is approved and covers the order it references,
 * marks that order as paid. The payment is always read from the API, never trusted from the
 * caller, so this is safe to run from the webhook and from the return page alike.
 * "retry" means Mercado Pago or the database could not be reached and the caller should try again.
 */
export async function confirmPayment(paymentId: string): Promise<ConfirmResult> {
  if (!/^\d+$/.test(paymentId)) return "ignored";
  const response = await mercadoPago(`/v1/payments/${paymentId}`);
  if (response.status === 404) return "ignored";
  if (!response.ok) return "retry";
  const payment = await response.json();
  if (payment.status !== "approved" || !UUID.test(String(payment.external_reference))) return "ignored";

  const db = adminClient();
  const order = await db.from("store_orders").select("id, total").eq("id", payment.external_reference).maybeSingle();
  if (order.error) return "retry";
  if (!order.data) return "ignored";
  if (payment.currency_id !== "MXN" || Number(payment.transaction_amount) + 0.005 < Number(order.data.total)) {
    console.error(`Pago ${paymentId} no cubre el pedido ${order.data.id}: ${payment.transaction_amount} ${payment.currency_id}`);
    return "ignored";
  }

  // Only a pending order becomes paid: a repeated notification, or one for an order already
  // shipped or cancelled, changes nothing.
  const update = await db
    .from("store_orders")
    .update({ status: "paid", payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq("id", order.data.id)
    .eq("status", "pending");
  return update.error ? "retry" : "paid";
}
