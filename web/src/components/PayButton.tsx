"use client";

import { useState } from "react";

/** Asks the server for the Mercado Pago checkout of an order and sends the buyer there. */
export async function startPayment(orderId: string): Promise<string | null> {
  const response = await fetch("/api/pagar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: orderId }),
  }).catch(() => null);
  const answer = await response?.json().catch(() => null);
  return response?.ok && answer?.url ? answer.url : null;
}

export function PayButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pay() {
    setBusy(true);
    setFailed(false);
    const url = await startPayment(orderId);
    if (url) {
      window.location.assign(url);
      return;
    }
    setFailed(true);
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button className="btn btn-primary btn-lg" onClick={pay} disabled={busy}>
        {busy ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
      </button>
      {failed && (
        <p role="alert" className="text-sm text-bad">
          No pudimos abrir el pago. Inténtalo de nuevo en un momento.
        </p>
      )}
    </div>
  );
}
