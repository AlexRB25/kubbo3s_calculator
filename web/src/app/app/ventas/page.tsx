"use client";

import { useState } from "react";
import { Empty, Line, Modal, PageHeader, TableCard } from "@/components/app/ui";
import { channelFees, productCost } from "@/lib/costs";
import { useData, useSave } from "@/lib/data";
import { day, money, num } from "@/lib/format";
import { supabase } from "@/lib/supabase";

function SaleForm({ onDone }: { onDone: () => void }) {
  const { products, channels, filaments, printers, profile, packaging, materials } = useData();
  const { busy, error, setError, save } = useSave();

  const [productId, setProductId] = useState("");
  const [customName, setCustomName] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  // What it really sold for; the channel price is only a reference to tell the discount.
  const [price, setPrice] = useState("");
  // Empty fields below use the automatic value shown as placeholder.
  const [fees, setFees] = useState("");
  const [delivery, setDelivery] = useState<"shipped" | "pickup">("shipped");
  const [shipping, setShipping] = useState("");
  const [packagingCost, setPackagingCost] = useState("");
  const [customCost, setCustomCost] = useState("");
  const [notes, setNotes] = useState("");

  const product = products.find((item) => item.id === productId);
  const channel = channels.find((item) => item.id === channelId);
  const pieces = Math.max(Math.round(num(quantity)), 0);
  const listPrice = product?.prices[channelId] ?? 0;
  const unitPrice = num(price);
  // Positive: sold below the list price; negative: above it.
  const discount = listPrice > 0 && price !== "" ? listPrice - unitPrice : 0;
  const autoFees = channelFees(channel, unitPrice, pieces);
  const totalFees = fees === "" ? autoFees : num(fees);
  const shipped = delivery === "shipped";
  const autoShipping = shipped ? (channel?.shipping_cost ?? 0) : 0;
  const totalShipping = shipped && shipping !== "" ? num(shipping) : autoShipping;
  // One package per sale, whatever the number of pieces.
  const autoPackaging = shipped ? (packaging.find((item) => item.id === product?.packaging_id)?.cost ?? 0) : 0;
  const totalPackaging = shipped && packagingCost !== "" ? num(packagingCost) : autoPackaging;
  const unitCost = product ? productCost(product, filaments, printers, profile?.kwh_price ?? 0, materials).total : num(customCost);
  const profit = pieces * unitPrice - totalFees - totalShipping - totalPackaging - pieces * unitCost;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = product?.name ?? customName.trim();
    if (!name) return setError("Elige un producto o escribe qué vendiste.");
    if (pieces < 1) return setError("Indica cuántas piezas vendiste.");
    if (price === "" || unitPrice <= 0) return setError("Indica en cuánto lo vendiste.");
    save(
      () =>
        supabase()
          .from("sales")
          .insert({
            product_id: productId || null,
            product_name: name,
            channel_id: channel?.id ?? null,
            channel_name: channel?.name ?? "",
            quantity: pieces,
            unit_price: unitPrice,
            list_price: listPrice > 0 ? listPrice : null,
            fees: totalFees,
            shipping_cost: totalShipping,
            packaging_cost: totalPackaging,
            // One package leaves stock with each shipped sale.
            packaging_id: shipped ? (product?.packaging_id ?? null) : null,
            unit_cost: Math.round(unitCost * 100) / 100,
            notes: notes.trim(),
          }),
      onDone,
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="label sm:col-span-2">
        Producto
        <select className="input" value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="">Otra cosa (sin producto)</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.stock} en stock
            </option>
          ))}
        </select>
        {product && pieces > product.stock && (
          <span className="font-normal text-warn">Solo hay {product.stock} en stock: la venta se registra igual y el stock quedará en negativo.</span>
        )}
      </label>
      {!product && (
        <>
          <label className="label">
            ¿Qué vendiste?
            <input className="input" value={customName} onChange={(event) => setCustomName(event.target.value)} maxLength={80} />
          </label>
          <label className="label">
            Costo por pieza ($)
            <input className="input" type="number" min={0} step="any" value={customCost} onChange={(event) => setCustomCost(event.target.value)} placeholder="0" />
          </label>
        </>
      )}
      <label className="label">
        Canal
        <select className="input" value={channelId} onChange={(event) => setChannelId(event.target.value)}>
          {channels.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Piezas
        <input className="input" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </label>
      <label className="label">
        ¿En cuánto lo vendiste? (por pieza, $)
        <input className="input" type="number" min={0} step="any" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" required />
        <span className="font-normal">
          {listPrice <= 0
            ? "Este producto no tiene precio de lista en este canal."
            : discount > 0
              ? `Descuento de ${money(discount)} (${Math.round((discount / listPrice) * 100)}%) sobre tu precio de lista de ${money(listPrice)}.`
              : discount < 0
                ? `${money(-discount)} arriba de tu precio de lista de ${money(listPrice)}.`
                : `Tu precio de lista es ${money(listPrice)}.`}
        </span>
      </label>
      <label className="label">
        Comisiones ($)
        <input className="input" type="number" min={0} step="any" value={fees} onChange={(event) => setFees(event.target.value)} placeholder={autoFees.toFixed(2)} />
      </label>
      <label className="label">
        Entrega
        <select className="input" value={delivery} onChange={(event) => setDelivery(event.target.value as "shipped" | "pickup")}>
          <option value="shipped">Con envío</option>
          <option value="pickup">Sin envío (recoge o paga el cliente)</option>
        </select>
      </label>
      {shipped && (
        <>
          <label className="label">
            Envío que pagaste ($)
            <input className="input" type="number" min={0} step="any" value={shipping} onChange={(event) => setShipping(event.target.value)} placeholder={autoShipping.toFixed(2)} />
          </label>
          <label className="label">
            Embalaje ($)
            <input className="input" type="number" min={0} step="any" value={packagingCost} onChange={(event) => setPackagingCost(event.target.value)} placeholder={autoPackaging.toFixed(2)} />
          </label>
        </>
      )}
      <label className="label">
        Notas
        <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={200} placeholder="Número de pedido, cliente…" />
      </label>
      <p className="text-xs text-muted sm:col-span-2">
        Comisión y envío salen del canal y el embalaje del producto; escribe el dato real si te cobraron otra cosa.
      </p>

      <div className="flex flex-col gap-1 rounded-lg bg-ink p-3 sm:col-span-2">
        {discount > 0 && <Line label={`Precio de lista ${pieces} × ${money(listPrice)}`} value={money(pieces * listPrice)} />}
        {discount > 0 && <Line label="Descuento" value={`− ${money(pieces * discount)}`} />}
        <Line label={`Vendiste ${pieces} × ${money(unitPrice)}`} value={money(pieces * unitPrice)} />
        <Line label="Comisiones" value={`− ${money(totalFees)}`} />
        <Line label="Envío" value={`− ${money(totalShipping)}`} />
        <Line label="Embalaje" value={`− ${money(totalPackaging)}`} />
        <Line label={`Costo de producción (${money(unitCost)} c/u)`} value={`− ${money(pieces * unitCost)}`} />
        <Line strong label={profit >= 0 ? "Ganancia" : "Pérdida"} value={money(profit)} />
      </div>

      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Registrar venta"}
        </button>
      </div>
    </form>
  );
}

export default function SalesPage() {
  const { sales } = useData();
  const { error, save } = useSave();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader title="Ventas">
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          Registrar venta
        </button>
      </PageHeader>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {sales.length === 0 ? (
        <Empty>Registra tus ventas de Mercado Libre, TikTok o directas y mira cuánto ganas en cada una.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Venta</th>
                <th>Canal</th>
                <th className="num">Total</th>
                <th className="num">Comisiones, envío y embalaje</th>
                <th className="num">Costo</th>
                <th className="num">Ganancia o pérdida</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="whitespace-nowrap text-muted">{day(sale.sold_at)}</td>
                  <td>
                    {sale.quantity} × {sale.product_name}
                    {sale.notes && <div className="text-xs text-muted">{sale.notes}</div>}
                  </td>
                  <td className="text-muted">{sale.channel_name || "—"}</td>
                  <td className="num">
                    {money(sale.quantity * sale.unit_price)}
                    {sale.list_price != null && sale.list_price > sale.unit_price && (
                      <div className="text-xs text-warn">desc. {money(sale.quantity * (sale.list_price - sale.unit_price))}</div>
                    )}
                  </td>
                  <td className="num text-muted">{money(sale.fees + sale.shipping_cost + sale.packaging_cost)}</td>
                  <td className="num text-muted">{money(sale.quantity * sale.unit_cost)}</td>
                  <td className={`num font-semibold ${sale.profit >= 0 ? "text-money" : "text-bad"}`}>{money(sale.profit)}</td>
                  <td className="num">
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        if (window.confirm(`Se eliminará la venta de ${sale.quantity} × ${sale.product_name}; las piezas vuelven al stock. ¿Eliminar?`)) {
                          save(() => supabase().from("sales").delete().eq("id", sale.id));
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {adding && (
        <Modal wide title="Registrar venta" onClose={() => setAdding(false)}>
          <SaleForm onDone={() => setAdding(false)} />
        </Modal>
      )}
    </>
  );
}
