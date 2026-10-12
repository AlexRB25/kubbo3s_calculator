"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PayButton, startPayment } from "@/components/PayButton";
import { clearCart, setCartQuantity, useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { shippingFor, type PlacedOrder, type StoreProduct, type StoreSettings } from "@/lib/store";
import { supabase } from "@/lib/supabase";

export default function CartPage() {
  const lines = useCart();
  const { session } = useSession();
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<PlacedOrder | null>(null);

  // Prices and stock are read fresh from the store: the cart only remembers ids and quantities.
  const ids = lines.map((line) => line.id).sort().join(",");
  useEffect(() => {
    let current = true;
    const db = supabase();
    Promise.all([
      ids ? db.from("store_products").select("*").in("id", ids.split(",")) : Promise.resolve({ data: [] }),
      db.from("store_settings").select("*").maybeSingle(),
    ]).then(([found, config]) => {
      if (!current) return;
      setProducts(found.data ?? []);
      setSettings(config.data);
    });
    return () => {
      current = false;
    };
  }, [ids]);

  const rows = lines.flatMap((line) => {
    const product = products?.find((item) => item.id === line.id);
    return product ? [{ product, quantity: line.quantity }] : [];
  });
  const subtotal = rows.reduce((total, row) => total + row.product.price * row.quantity, 0);
  const shipping = shippingFor(subtotal, settings);
  const short = rows.find((row) => row.quantity > row.product.stock);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const customer = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError("");
    const { data, error } = await supabase().rpc("place_order", {
      p_customer: customer,
      p_items: rows.map((row) => ({ product_id: row.product.id, quantity: row.quantity })),
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    clearCart();
    // With Mercado Pago configured the buyer goes straight to pay; otherwise (or if it cannot be
    // reached) the order stays placed and the page shows how to pay by hand.
    const checkout = await startPayment(data.id);
    if (checkout) {
      window.location.assign(checkout);
      return;
    }
    setOrder(data);
    setBusy(false);
    window.scrollTo({ top: 0 });
  }

  if (order) {
    const message = encodeURIComponent(`Hola, hice el pedido #${order.number} en Kubbo3D por ${money(order.total)}.`);
    return (
      <main className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-16 text-center">
        <h1 className="text-3xl">¡Gracias! Recibimos tu pedido #{order.number}</h1>
        <p className="text-muted">
          Total a pagar: <strong className="text-white">{money(order.total)}</strong>
          {order.shipping > 0 && ` (incluye ${money(order.shipping)} de envío)`}. Guarda tu número de pedido.
        </p>
        {settings?.payment_instructions && (
          <div className="card text-left">
            <h2>Cómo pagar</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{settings.payment_instructions}</p>
          </div>
        )}
        <PayButton orderId={order.id} />
        <div className="flex flex-wrap justify-center gap-3">
          {settings?.whatsapp && (
            <a href={`https://wa.me/${settings.whatsapp}?text=${message}`} target="_blank" rel="noreferrer" className="btn btn-lg">
              Enviar comprobante por WhatsApp
            </a>
          )}
          <Link href="/tienda" className="btn btn-lg">
            Seguir comprando
          </Link>
        </div>
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="text-3xl">Tu carrito está vacío</h1>
        <Link href="/tienda" className="btn btn-primary btn-lg">
          Ir a la tienda
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl">Tu carrito</h1>
      {products === null ? (
        <p className="mt-6 text-muted">Cargando…</p>
      ) : (
        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
          <div className="flex flex-col gap-6">
            <ul className="flex flex-col gap-3">
              {rows.map(({ product, quantity }) => (
                <li key={product.id} className="card flex flex-wrap items-center gap-4 p-3">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-raised">
                    {product.images[0] && <Image src={product.images[0]} alt="" fill sizes="80px" className="object-cover" />}
                  </div>
                  <div className="min-w-40 flex-1">
                    <Link href={`/tienda/${product.slug}`} className="font-medium hover:underline">
                      {product.name}
                    </Link>
                    <p className="text-sm text-muted">{money(product.price)} c/u</p>
                    {quantity > product.stock && <p className="text-sm text-bad">Solo quedan {product.stock}.</p>}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={product.stock}
                    value={quantity}
                    aria-label={`Cantidad de ${product.name}`}
                    onChange={(event) => setCartQuantity(product.id, Math.max(1, Math.round(Number(event.target.value)) || 1))}
                    className="input w-20"
                  />
                  <strong className="w-24 text-right tabular-nums">{money(product.price * quantity)}</strong>
                  <button className="btn" onClick={() => setCartQuantity(product.id, 0)}>
                    Quitar
                  </button>
                </li>
              ))}
              {rows.length < lines.length && <li className="text-sm text-muted">Algunos productos de tu carrito ya no están disponibles.</li>}
            </ul>

            {rows.length > 0 && (
              <form id="checkout" onSubmit={submit} className="card grid gap-4 sm:grid-cols-2">
                <h2 className="sm:col-span-2">Datos de entrega</h2>
                <label className="label">
                  Nombre completo
                  <input name="name" className="input" autoComplete="name" required maxLength={120} />
                </label>
                <label className="label">
                  Correo
                  <input name="email" type="email" className="input" autoComplete="email" required defaultValue={session?.user.email ?? ""} />
                </label>
                <label className="label">
                  Teléfono o WhatsApp
                  <input name="phone" type="tel" className="input" autoComplete="tel" required maxLength={30} />
                </label>
                <label className="label">
                  Código postal
                  <input name="postal_code" className="input" autoComplete="postal-code" inputMode="numeric" required maxLength={10} />
                </label>
                <label className="label sm:col-span-2">
                  Calle, número y colonia
                  <input name="address" className="input" autoComplete="street-address" required maxLength={300} />
                </label>
                <label className="label">
                  Ciudad
                  <input name="city" className="input" autoComplete="address-level2" required maxLength={80} />
                </label>
                <label className="label">
                  Estado
                  <input name="state" className="input" autoComplete="address-level1" required maxLength={80} />
                </label>
                <label className="label sm:col-span-2">
                  Notas para el pedido (opcional)
                  <textarea name="notes" className="input" rows={2} maxLength={500} placeholder="Color, referencias para la entrega…" />
                </label>
              </form>
            )}
          </div>

          <aside className="card flex flex-col gap-3 lg:sticky lg:top-20">
            <h2>Resumen</h2>
            <p className="flex justify-between text-sm">
              <span className="text-muted">Productos</span>
              <span className="tabular-nums">{money(subtotal)}</span>
            </p>
            <p className="flex justify-between text-sm">
              <span className="text-muted">Envío</span>
              <span className="tabular-nums">{shipping > 0 ? money(shipping) : "Gratis"}</span>
            </p>
            {settings?.free_shipping_from != null && subtotal < settings.free_shipping_from && (
              <p className="text-xs text-muted">Envío gratis a partir de {money(settings.free_shipping_from)}.</p>
            )}
            <p className="flex justify-between border-t border-line pt-3 text-lg font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money(subtotal + shipping)}</span>
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button form="checkout" className="btn btn-primary btn-lg" disabled={busy || rows.length === 0 || Boolean(short)}>
              {busy ? "Enviando…" : "Hacer pedido y pagar"}
            </button>
            <p className="text-xs text-muted">
              Al hacer tu pedido apartamos tus piezas y te llevamos a pagar con Mercado Pago (tarjeta, SPEI o efectivo). Lo
              enviamos en cuanto se confirme tu pago.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
