import type { Metadata } from "next";
import Link from "next/link";
import { PayButton } from "@/components/PayButton";
import { Price } from "@/components/Price";
import { adminClient, confirmPayment, paymentsConfigured, UUID } from "@/lib/server";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

const TITLES: Record<string, string> = {
  paid: "¡Pago recibido!",
  shipped: "Tu pedido va en camino",
  delivered: "Pedido entregado",
  cancelled: "Este pedido fue cancelado",
};

/**
 * Where Mercado Pago sends the buyer back, and the page to check on an order later. The order
 * id in the link is the only key: it shows the status and total, never the buyer's details.
 */
export default async function OrderPage({ searchParams }: PageProps<"/pedido">) {
  const params = await searchParams;
  const id = String(params.id ?? params.external_reference ?? "");
  const paymentId = String(params.payment_id ?? params.collection_id ?? "");

  if (!paymentsConfigured() || !UUID.test(id)) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="text-3xl">No encontramos ese pedido</h1>
        <Link href="/tienda" className="btn btn-lg">
          Ir a la tienda
        </Link>
      </main>
    );
  }

  // The webhook may not have arrived yet (or cannot reach localhost): check the payment now.
  if (paymentId) await confirmPayment(paymentId);

  const db = adminClient();
  const [{ data: order }, { data: settings }] = await Promise.all([
    db.from("store_orders").select("number, status, total, tracking").eq("id", id).maybeSingle(),
    db.from("store_settings").select("whatsapp").eq("id", 1).maybeSingle(),
  ]);
  if (!order) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="text-3xl">No encontramos ese pedido</h1>
      </main>
    );
  }

  // Mercado Pago says "pending"/"in_process" for payments that settle later (OXXO, SPEI).
  const settling = order.status === "pending" && ["pending", "in_process"].includes(String(params.status ?? ""));
  const message = encodeURIComponent(`Hola, tengo una duda sobre mi pedido #${order.number} de Kubbo3D.`);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-5 px-4 py-16 text-center">
      <h1 className="text-3xl">{TITLES[order.status] ?? (settling ? "Estamos esperando tu pago" : "Tu pedido está por pagar")}</h1>
      <p className="text-muted">
        Pedido <strong className="text-white">#{order.number}</strong> · Total{" "}
        <strong className="text-white"><Price mxn={order.total} charged /></strong>
      </p>

      {order.status === "paid" && <p className="text-muted">Ya estamos preparando tu pedido. Te avisaremos cuando salga.</p>}
      {order.status === "shipped" && order.tracking && <p className="card w-full text-sm">Guía de envío: {order.tracking}</p>}
      {order.status === "pending" &&
        (settling ? (
          <p className="text-muted">
            Si pagaste en efectivo o por transferencia, Mercado Pago nos avisa en cuanto se acredite; puedes volver a esta
            página para ver el estado.
          </p>
        ) : (
          <>
            <p className="text-muted">Tus piezas están apartadas. Completa el pago para que lo enviemos.</p>
            <PayButton orderId={id} />
          </>
        ))}

      <div className="flex flex-wrap justify-center gap-3">
        {settings?.whatsapp && (
          <a href={`https://wa.me/${settings.whatsapp}?text=${message}`} target="_blank" rel="noreferrer" className="btn">
            Escribirnos por WhatsApp
          </a>
        )}
        <Link href="/tienda" className="btn">
          Seguir comprando
        </Link>
      </div>
    </main>
  );
}
