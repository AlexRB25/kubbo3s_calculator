"use client";

import Image from "next/image";
import { useState } from "react";
import { Empty, Line, Modal, PageHeader, TableCard } from "@/components/app/ui";
import { filamentName, productCost, suggestedPrice, unitProfit } from "@/lib/costs";
import { useData, useSave } from "@/lib/data";
import { duration, field, money, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { imageUrl, supabase, uploadProductImage } from "@/lib/supabase";
import type { Product } from "@/lib/types";

type RecipeRow = { filament_id: string; grams: string };

function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const { session } = useSession();
  const { filaments, printers, channels, profile } = useData();
  const { busy, error, setError, save } = useSave();

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [hours, setHours] = useState(field(Math.floor((product?.print_minutes ?? 0) / 60)));
  const [minutes, setMinutes] = useState(field((product?.print_minutes ?? 0) % 60));
  const [extraCost, setExtraCost] = useState(field(product?.extra_cost));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [photo, setPhoto] = useState<File | null>(null);
  const [recipe, setRecipe] = useState<RecipeRow[]>(
    product?.filaments.map((use) => ({ filament_id: use.filament_id, grams: String(use.grams) })) ?? [{ filament_id: "", grams: "" }],
  );
  const [printerIds, setPrinterIds] = useState<string[]>(product?.printer_ids ?? []);
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(product?.prices ?? {}).map(([channel, price]) => [channel, String(price)])),
  );

  const draft = {
    filaments: recipe.flatMap((row) => (row.filament_id && num(row.grams) > 0 ? [{ filament_id: row.filament_id, grams: num(row.grams) }] : [])),
    printer_ids: printerIds,
    print_minutes: Math.round(num(hours) * 60 + num(minutes)),
    extra_cost: num(extraCost),
  };
  const cost = productCost(draft, filaments, printers, profile?.kwh_price ?? 0);

  const setRow = (index: number, change: Partial<RecipeRow>) =>
    setRecipe(recipe.map((row, position) => (position === index ? { ...row, ...change } : row)));

  async function write() {
    let imagePath = product?.image_path ?? null;
    if (photo) {
      const upload = await uploadProductImage(session!.user.id, photo);
      if (upload.error) return { error: { message: `No se pudo subir la foto: ${upload.error.message}` } };
      imagePath = upload.path;
    }
    const row = {
      name: name.trim(),
      sku: sku.trim(),
      description: description.trim(),
      image_path: imagePath,
      ...draft,
      prices: Object.fromEntries(Object.entries(prices).flatMap(([channel, price]) => (num(price) > 0 ? [[channel, num(price)]] : []))),
      // Prints and sales move the stock on the server; send it only when it was corrected here.
      ...(product && Math.round(num(stock)) === product.stock ? {} : { stock: Math.round(num(stock)) }),
    };
    const result = product
      ? await supabase().from("products").update(row).eq("id", product.id)
      : await supabase().from("products").insert(row);
    if (!result.error && photo && product?.image_path) await supabase().storage.from("products").remove([product.image_path]);
    return result;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (recipe.some((row) => row.filament_id && num(row.grams) <= 0)) return setError("Indica cuántos gramos consume cada filamento.");
    save(write, onDone);
  }

  function remove() {
    if (!window.confirm(`Se eliminará "${product!.name}". Sus impresiones y ventas se conservan en el historial.`)) return;
    save(async () => {
      const result = await supabase().from("products").delete().eq("id", product!.id);
      if (!result.error && product!.image_path) await supabase().storage.from("products").remove([product!.image_path]);
      return result;
    }, onDone);
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="label">
        Nombre
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
      </label>
      <label className="label">
        SKU o clave
        <input className="input" value={sku} onChange={(event) => setSku(event.target.value)} maxLength={40} />
      </label>
      <label className="label sm:col-span-2">
        Descripción
        <textarea className="input" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
      </label>
      <label className="label sm:col-span-2">
        Foto
        <input type="file" accept="image/*" className="input" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
      </label>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">Filamento por pieza</legend>
        {recipe.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <label className="label flex-1">
              Filamento
              <select className="input" value={row.filament_id} onChange={(event) => setRow(index, { filament_id: event.target.value })}>
                <option value="">Elegir…</option>
                {filaments.map((filament) => (
                  <option key={filament.id} value={filament.id}>
                    {filamentName(filament)} · {money(filament.cost_per_kg)}/kg
                  </option>
                ))}
              </select>
            </label>
            <label className="label w-28">
              Gramos
              <input className="input" type="number" min={0} step="any" value={row.grams} onChange={(event) => setRow(index, { grams: event.target.value })} />
            </label>
            <button type="button" className="btn" aria-label="Quitar filamento" onClick={() => setRecipe(recipe.filter((_, position) => position !== index))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn self-start" onClick={() => setRecipe([...recipe, { filament_id: "", grams: "" }])}>
          + Otro filamento
        </button>
      </fieldset>

      <label className="label">
        Horas de impresión
        <input className="input" type="number" min={0} value={hours} onChange={(event) => setHours(event.target.value)} placeholder="0" />
      </label>
      <label className="label">
        Minutos
        <input className="input" type="number" min={0} value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder="0" />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-xs font-medium text-muted">Máquinas en las que sale</legend>
        <div className="flex flex-wrap gap-3">
          {printers.map((printer) => (
            <label key={printer.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={printerIds.includes(printer.id)}
                onChange={(event) =>
                  setPrinterIds(event.target.checked ? [...printerIds, printer.id] : printerIds.filter((item) => item !== printer.id))
                }
              />
              {printer.name}
            </label>
          ))}
          {printers.length === 0 && <span className="text-sm text-muted">Da de alta tus impresoras para sumar luz y desgaste al costo.</span>}
        </div>
      </fieldset>
      <label className="label">
        Otros costos por pieza ($)
        <input className="input" type="number" min={0} step="any" value={extraCost} onChange={(event) => setExtraCost(event.target.value)} placeholder="0" />
        <span className="font-normal">Empaque, tornillos, imanes, etiquetas…</span>
      </label>
      <label className="label">
        Piezas en stock
        <input className="input" type="number" step={1} value={stock} onChange={(event) => setStock(event.target.value)} />
        <span className="font-normal">Sube con cada impresión y baja con cada venta; cámbialo solo para corregirlo.</span>
      </label>

      <div className="flex flex-col gap-1 rounded-lg bg-ink p-3 sm:col-span-2">
        <Line label="Filamento" value={money(cost.filament)} />
        <Line label="Luz" value={money(cost.electricity)} />
        <Line label="Desgaste de máquina" value={money(cost.machine)} />
        <Line label="Otros" value={money(cost.extra)} />
        <Line strong label="Costo por pieza" value={money(cost.total)} />
      </div>

      {channels.map((channel) => {
        const price = num(prices[channel.id] ?? "");
        return (
          <label key={channel.id} className="label">
            Precio en {channel.name} ($)
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              value={prices[channel.id] ?? ""}
              onChange={(event) => setPrices({ ...prices, [channel.id]: event.target.value })}
              placeholder={`Sugerido ${suggestedPrice(cost.total, channel, profile?.margin_pct ?? 0).toFixed(2)}`}
            />
            {price > 0 && <span className="font-normal">Ganas {money(unitProfit(price, cost.total, channel))} por pieza</span>}
          </label>
        );
      })}

      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        {product && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}

export default function ProductsPage() {
  const { products, filaments, printers, channels, profile } = useData();
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  return (
    <>
      <PageHeader title="Productos">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo producto
        </button>
      </PageHeader>

      {products.length === 0 ? (
        <Empty>Da de alta tus productos con su foto, el filamento que consumen y en qué máquinas salen.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">Tiempo</th>
                <th className="num">Costo</th>
                {channels.map((channel) => (
                  <th key={channel.id} className="num">
                    {channel.name}
                  </th>
                ))}
                <th className="num">Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const cost = productCost(product, filaments, printers, profile?.kwh_price ?? 0).total;
                const photo = imageUrl(product.image_path);
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-raised">
                          {photo && <Image src={photo} alt="" fill sizes="40px" className="object-cover" />}
                        </div>
                        <div>
                          {product.name}
                          {product.sku && <div className="text-xs text-muted">{product.sku}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="num text-muted">{duration(product.print_minutes)}</td>
                    <td className="num">{money(cost)}</td>
                    {channels.map((channel) => {
                      const price = product.prices[channel.id];
                      if (!price) {
                        return (
                          <td key={channel.id} className="num text-xs text-muted">
                            sugerido {money(suggestedPrice(cost, channel, profile?.margin_pct ?? 0))}
                          </td>
                        );
                      }
                      const profit = unitProfit(price, cost, channel);
                      return (
                        <td key={channel.id} className="num">
                          {money(price)}
                          <div className={`text-xs ${profit >= 0 ? "text-money" : "text-bad"}`}>gana {money(profit)}</div>
                        </td>
                      );
                    })}
                    <td className={`num font-semibold ${product.stock <= 0 ? "text-bad" : ""}`}>{product.stock}</td>
                    <td className="num">
                      <button className="btn" onClick={() => setEditing(product)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {editing && (
        <Modal wide title={editing === "new" ? "Nuevo producto" : editing.name} onClose={() => setEditing(null)}>
          <ProductForm product={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
