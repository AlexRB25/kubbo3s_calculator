import { confirmCheckout, paymentsConfigured, refundPayment } from "@/lib/server";
import { validStripeSignature } from "@/lib/stripe";

/**
 * Stripe calls this when a checkout is paid (card at once, OXXO when the cash arrives) and when money is
 * given back. Events to send it: checkout.session.completed, checkout.session.async_payment_succeeded,
 * charge.refunded and charge.dispute.created. Any answer other than 2xx makes Stripe retry, so only
 * temporary failures answer with an error. The event only says which session or charge changed: the
 * session is read again from the API before marking anything paid.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!paymentsConfigured() || !secret) return new Response(null, { status: 503 });

  const payload = await request.text();
  if (!validStripeSignature(payload, request.headers.get("stripe-signature"), secret)) return new Response(null, { status: 401 });
  const event = JSON.parse(payload);
  const object = event.data?.object ?? {};

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const { result } = await confirmCheckout(String(object.id ?? ""));
    return new Response(null, { status: result === "retry" ? 502 : 200 });
  }
  // A partial refund keeps the purchase; a full one or a dispute takes it back.
  if ((event.type === "charge.refunded" && object.refunded) || event.type === "charge.dispute.created") {
    const result = await refundPayment(String(object.payment_intent ?? ""));
    return new Response(null, { status: result === "retry" ? 502 : 200 });
  }
  return new Response(null, { status: 200 });
}
