import { createHmac, timingSafeEqual } from "node:crypto";
import { fromMxn, isCurrency, loadRates, type Currency } from "./currency";

// Server-only: Stripe's REST API with plain fetch (form-encoded), and its webhook signature.

/** Flattens {a: {b: [1]}} into Stripe's form fields: a[b][0]=1. */
function form(value: unknown, prefix = "", out = new URLSearchParams()) {
  if (value === undefined || value === null) return out;
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) form(item, prefix ? `${prefix}[${key}]` : key, out);
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

/** Calls the Stripe API with the secret key: GET without params, POST with them. */
export function stripe(path: string, params?: Record<string, unknown>, method?: "GET" | "POST" | "DELETE") {
  return fetch(`https://api.stripe.com/v1${path}`, {
    method: method ?? (params ? "POST" : "GET"),
    cache: "no-store",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? form(params) : undefined,
  });
}

/**
 * Checks the Stripe-Signature header ("t=…,v1=…"): v1 is the HMAC-SHA256, in hex, of "<t>.<raw body>" with
 * the endpoint's signing secret. Older than 5 minutes is rejected (replays).
 */
export function validStripeSignature(payload: string, header: string | null, secret: string) {
  const parts = (header ?? "").split(",").map((part) => part.trim().split("=") as [string, string]);
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex"));
  return parts.some(([key, value]) => {
    if (key !== "v1") return false;
    const received = Buffer.from(value);
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

/** Currencies Stripe charges without cents (amounts are whole units). */
const ZERO_DECIMAL = new Set(["CLP", "PYG"]);

/** The currency a buyer pays in: theirs when Stripe can charge it (not bolívares), dollars otherwise. */
export const chargeCurrency = (wanted: unknown): Currency => (isCurrency(wanted) && wanted !== "VES" ? wanted : "USD");

/** An amount in Stripe's smallest unit (cents, or whole pesos for the zero-decimal currencies). */
export const stripeAmount = (amount: number, currency: Currency) => Math.round(ZERO_DECIMAL.has(currency) ? amount : amount * 100);

/** A price in Mexican pesos as Stripe charges it in the buyer's currency, at today's rate. */
export async function chargeFromMxn(mxn: number, currency: Currency) {
  const rates = await loadRates();
  return stripeAmount(currency === "MXN" ? mxn : fromMxn(mxn, currency, rates), currency);
}
