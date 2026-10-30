import type { Metadata } from "next";
import Link from "next/link";
import { Price } from "@/components/Price";
import { adminClient, confirmPayment, paymentsConfigured, UUID } from "@/lib/server";

export const metadata: Metadata = { title: "Tu compra", robots: { index: false } };

/** Where Mercado Pago sends the buyer of a model back. The purchase id (impossible to guess) is the only key. */
export default async function ModelPurchasePage({ searchParams }: PageProps<"/modelos/compra">) {
  const params = await searchParams;
  const id = String(params.id ?? "");
  const paymentId = String(params.payment_id ?? params.collection_id ?? "");

  const purchase =
    paymentsConfigured() && UUID.test(id)
      ? await (async () => {
          // The webhook may not have arrived yet (or cannot reach localhost): check the payment now.
          if (paymentId) await confirmPayment(paymentId);
          const { data } = await adminClient().from("model_purchases").select("model_id, title, price, status").eq("id", id).maybeSingle();
          return data;
        })()
      : null;

  if (!purchase) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="text-3xl">No encontramos esa compra</h1>
        <Link href="/modelos" className="btn btn-lg">
          Ir a los modelos
        </Link>
      </main>
    );
  }

  // Mercado Pago says "pending"/"in_process" for payments that settle later (OXXO, SPEI).
  const settling = purchase.status === "pending" && ["pending", "in_process"].includes(String(params.status ?? ""));
  const title =
    purchase.status === "paid"
      ? "¡Listo, ya es tuyo!"
      : purchase.status === "refunded"
        ? "Esta compra fue reembolsada"
        : settling
          ? "Estamos esperando tu pago"
          : "Tu compra está por pagar";

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-5 px-4 py-16 text-center">
      <h1 className="text-3xl">{title}</h1>
      <p className="text-muted">
        <strong className="text-white">{purchase.title}</strong> · <Price mxn={purchase.price} />
      </p>
      {purchase.status === "paid" && <p className="text-muted">Descárgalo cuando quieras: también queda guardado en Mi biblioteca.</p>}
      {settling && <p className="text-muted">Cuando Mercado Pago confirme el pago (OXXO o transferencia pueden tardar), podrás descargarlo desde Mi biblioteca.</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Link href={`/modelos/${purchase.model_id}`} className="btn btn-primary btn-lg">
          {purchase.status === "paid" ? "Descargar" : "Volver al modelo"}
        </Link>
        <Link href="/modelos/biblioteca" className="btn btn-lg">
          Mi biblioteca
        </Link>
      </div>
    </main>
  );
}
