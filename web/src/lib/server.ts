import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Currency } from "./currency";
import { chargeFromMxn, stripe } from "./stripe";

// Server-only helpers for charging store orders. Nothing here may be imported from a client component.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the site can charge online (Stripe); otherwise checkout falls back to manual payment instructions. */
export const paymentsConfigured = () =>
  Boolean(process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_SECRET_KEY && process.env.PB_SUPABASE_URL);

let client: SupabaseClient | undefined;

/** Bypasses RLS: only for reading an order to charge it and marking it paid. */
export function adminClient(): SupabaseClient {
  return (client ??= createClient(process.env.PB_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** What a Stripe Checkout Session pays for, in its metadata: a store order, a marketplace purchase or a pack of scans. */
export type CheckoutKind = "order" | "model" | "scans";

type Confirm = { result: "paid" | "waiting" | "ignored" | "retry" };

/**
 * Asks Stripe about a Checkout Session and, once it is paid, marks the store order or the model purchase
 * it was made for as paid. The session is always read from the API with the secret key, never trusted from
 * the caller, so the webhook and the return pages can both call it. "waiting": completed but the money
 * settles later (OXXO). "retry": Stripe or the database could not be reached.
 */
export async function confirmCheckout(sessionId: string): Promise<Confirm> {
  if (!/^cs_[\w]{10,200}$/.test(sessionId)) return { result: "ignored" };
  const response = await stripe(`/checkout/sessions/${sessionId}`);
  if (response.status === 404) return { result: "ignored" };
  if (!response.ok) return { result: "retry" };
  const session = await response.json();
  const kind = session.metadata?.kind as CheckoutKind | undefined;
  const id = String(session.metadata?.id ?? "");
  if (!UUID.test(id) || (kind !== "order" && kind !== "model" && kind !== "scans")) return { result: "ignored" };
  if (session.payment_status !== "paid") return { result: session.status === "complete" ? "waiting" : "ignored" };

  const db = adminClient();
  const table = kind === "order" ? "store_orders" : kind === "model" ? "model_purchases" : "scan_purchases";
  const paid = {
    status: "paid",
    payment_id: String(session.payment_intent ?? session.id),
    paid_at: new Date().toISOString(),
    paid_amount: Number(session.amount_total) / (["CLP", "PYG"].includes(String(session.currency).toUpperCase()) ? 1 : 100),
    paid_currency: String(session.currency).toUpperCase(),
  };
  // Only a pending one becomes paid: a repeated notification, or one for an order already shipped or
  // cancelled, changes nothing.
  const update = await db.from(table).update(paid).eq("id", id).eq("status", "pending");
  if (update.error?.code === "23505") {
    // The buyer already owned the model (paid twice in two tabs): the second payment is refunded by hand.
    console.error(`Pago ${paid.payment_id}: el comprador ya tenía el modelo de la compra ${id}; reembólsalo en Stripe.`);
    return { result: "ignored" };
  }
  return { result: update.error ? "retry" : "paid" };
}

/**
 * Stripe gave the money of a payment back (refund or lost dispute): the buyer of a model loses the download
 * and the seller the amount from their balance. Store orders are handled by hand from the admin panel.
 */
export async function refundPayment(paymentIntent: string): Promise<"ok" | "retry"> {
  if (!/^pi_\w+$/.test(paymentIntent)) return "ok";
  const update = await adminClient().from("model_purchases").update({ status: "refunded" }).eq("payment_id", paymentIntent).eq("status", "paid");
  // A pack of scans paid back takes its scans away too.
  const scans = await adminClient().from("scan_purchases").update({ status: "refunded" }).eq("payment_id", paymentIntent).eq("status", "paid");
  return update.error || scans.error ? "retry" : "ok";
}

type CheckoutLine = { name: string; mxn: number; quantity: number };

/**
 * Opens a Stripe Checkout for a store order or a model purchase, charged in the buyer's currency at today's
 * rate (the prices are in Mexican pesos). Answers the page to send the buyer to, or null when Stripe refused.
 */
export async function createCheckout(options: { kind: CheckoutKind; id: string; email?: string; lines: CheckoutLine[]; currency: Currency; back: string }) {
  const lineItems = await Promise.all(
    options.lines.map(async (line) => ({
      quantity: line.quantity,
      price_data: { currency: options.currency.toLowerCase(), unit_amount: await chargeFromMxn(line.mxn, options.currency), product_data: { name: line.name.slice(0, 250) } },
    })),
  );
  const metadata = { kind: options.kind, id: options.id };
  const separator = options.back.includes("?") ? "&" : "?";
  const response = await stripe("/checkout/sessions", {
    mode: "payment",
    line_items: lineItems,
    customer_email: options.email || undefined,
    client_reference_id: options.id,
    metadata,
    payment_intent_data: { metadata, statement_descriptor_suffix: "KUBBO3D" },
    success_url: `${options.back}${separator}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: options.back,
    locale: "es",
  });
  if (!response.ok) {
    console.error("Stripe rechazó el pago:", response.status, await response.text());
    return null;
  }
  return String((await response.json()).url);
}
