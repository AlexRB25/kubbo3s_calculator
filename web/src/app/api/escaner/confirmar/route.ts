import { preflight, withCors } from "@/lib/cors";
import { confirmCheckout, paymentsConfigured } from "@/lib/server";

/**
 * Back from Stripe with ?session_id=…: confirms the payment of a pack of scans right away (the webhook does
 * the same; whichever comes first marks it paid). The session is read from Stripe, never trusted.
 */
export const OPTIONS = preflight;

export const POST = async (request: Request) => withCors(request, await handle(request));

async function handle(request: Request) {
  if (!paymentsConfigured()) return Response.json({ result: "ignored" });
  const body = await request.json().catch(() => null);
  const { result } = await confirmCheckout(String(body?.session_id ?? ""));
  return Response.json({ result });
}
