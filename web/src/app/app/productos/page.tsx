"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Empty, Line, Modal, PageHeader, TableCard } from "@/components/app/ui";
import { costOnPrinter, costPerGram, filamentName, packagingName, productCost, recipeFor, shippingCost, suggestedPrice, unitProfit } from "@/lib/costs";
import { useData, useSave } from "@/lib/data";
import { duration, field, money, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { imageUrl, supabase, uploadProductImage } from "@/lib/supabase";
import type { Plate, Product } from "@/lib/types";

/** A plate as typed: hours, minutes and grams stay text while editing. */
type PlateRow = { name: string; hours: string; minutes: string; grams: Record<string, string> };

const emptyPlate = (index: number): PlateRow => ({ name: `Placa ${index + 1}`, hours: "", minutes: "", grams: {} });

/** Plates by printer, as saved; older products get one plate per printer from their single recipe. */
function platesOf(product: Product | undefined): Record<string, PlateRow[]> {
  const rows: Record<string, PlateRow[]> = {};
  const toRow = (plate: Pick<Plate, "name" | "minutes" | "grams">): PlateRow => ({
    name: plate.name,
    hours: field(Math.floor(plate.minutes / 60)),
    minutes: field(plate.minutes % 60),
    grams: Object.fromEntries(Object.entries(plate.grams).map(([id, grams]) => [id, field(grams)])),
  });
  if (product?.plates?.length) {
    for (const plate of product.plates) (rows[plate.printer_id] ??= []).push(toRow(plate));
  } else if (product) {
    const grams = Object.fromEntries(product.filaments.map((use) => [use.filament_id, use.grams]));
    for (const id of product.printer_ids) rows[id] = [toRow({ name: "Placa 1", minutes: product.print_minutes, grams })];
  }
  return rows;
}

function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const { session } = useSession();
  const { filaments, printers, channels, profile, packaging } = useData();
  const { busy, error, setError, save } = useSave();

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [extraCost, setExtraCost] = useState(field(product?.extra_cost));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [photo, setPhoto] = useState<File | null>(null);
  // Filaments the piece uses; each plate says how many grams of each it takes.
  const [used, setUsed] = useState<string[]>(product?.filaments.length ? product.filaments.map((use) => use.filament_id) : [""]);
  const [printerIds, setPrinterIds] = useState<string[]>(() => Object.keys(platesOf(product)));
  const [plates, setPlates] = useState<Record<string, PlateRow[]>>(() => platesOf(product));
  const [packagingId, setPackagingId] = useState(product?.packaging_id ?? "");
  const box = packaging.find((item) => item.id === packagingId);
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(product?.prices ?? {}).map(([channel, price]) => [channel, String(price)])),
  );

  const usedIds = [...new Set(used.filter(Boolean))];
  const savedPlates: Plate[] = printerIds.flatMap((printerId) =>
    (plates[printerId] ?? []).map((plate, index) => ({
      printer_id: printerId,
      name: plate.name.trim() || `Placa ${index + 1}`,
      minutes: Math.round(num(plate.hours) * 60 + num(plate.minutes)),
      grams: Object.fromEntries(usedIds.map((id) => [id, num(plate.grams[id] ?? "")])),
    })),
  );
  // The general recipe is the average over the printers, for screens that do not know about plates.
  const recipes = printerIds.map((printerId) => recipeFor({ filaments: [], print_minutes: 0, plates: savedPlates }, printerId));
  const average = (pick: (recipe: (typeof recipes)[number]) => number) =>
    recipes.length ? Math.round((recipes.reduce((total, recipe) => total + pick(recipe), 0) / recipes.length) * 100) / 100 : 0;
  const draft = {
    plates: savedPlates,
    printer_ids: printerIds,
    filaments: usedIds.map((id) => ({ filament_id: id, grams: average((recipe) => recipe.filaments.find((use) => use.filament_id === id)?.grams ?? 0) })),
    print_minutes: Math.round(average((recipe) => recipe.minutes)),
    extra_cost: num(extraCost),
  };
  const cost = productCost(draft, filaments, printers, profile?.kwh_price ?? 0);

  const setPlate = (printerId: string, index: number, change: Partial<PlateRow>) =>
    setPlates({ ...plates, [printerId]: plates[printerId].map((plate, position) => (position === index ? { ...plate, ...change } : plate)) });

  function togglePrinter(printerId: string, on: boolean) {
    setPrinterIds(on ? [...printerIds, printerId] : printerIds.filter((item) => item !== printerId));
    if (on && !plates[printerId]?.length) setPlates({ ...plates, [printerId]: [emptyPlate(0)] });
  }

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
      packaging_id: packagingId || null,
      prices: Object.fromEntries(Object.entries(prices).flatMap(([channel, price]) => (num(price) > 0 ? [[channel, num(price)]] : []))),
      // Stock is typed only for a new product; later prints, sales and arqueos move it.
      ...(product ? {} : { stock: Math.round(num(stock)) }),
    };
    const result = product
      ? await supabase().from("products").update(row).eq("id", product.id)
      : await supabase().from("products").insert(row);
    if (!result.error && photo && product?.image_path) await supabase().storage.from("products").remove([product.image_path]);
    return result;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!usedIds.length) return setError("Indica qué filamentos usa la pieza.");
    if (!printerIds.length) return setError("Elige al menos una impresora y llena sus placas.");
    for (const printerId of printerIds) {
      const recipe = recipeFor(draft, printerId);
      const printer = printers.find((item) => item.id === printerId)?.name ?? "la impresora";
      if (!recipe.filaments.length) return setError(`Indica los gramos de filamento de las placas en ${printer}.`);
      if (recipe.minutes <= 0) return setError(`Indica el tiempo de las placas en ${printer}.`);
    }
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
      {/* Only the button opens the files: a label around the whole field caught clicks meant for other fields. */}
      <div className="label sm:col-span-2">
        Foto
        <div className="flex flex-wrap items-center gap-3 font-normal">
          <input id="product-photo" type="file" accept="image/*" className="sr-only" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
          <label htmlFor="product-photo" className="btn cursor-pointer">
            {photo || product?.image_path ? "Cambiar foto" : "Elegir foto"}
          </label>
          <span className="text-sm text-muted">{photo ? photo.name : product?.image_path ? "Ya tiene foto" : "Sin foto"}</span>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">Filamentos que usa</legend>
        <p className="text-xs text-muted">Solo cuáles: los gramos de cada uno van abajo, en cada placa.</p>
        {used.map((filamentId, index) => {
          const filament = filaments.find((item) => item.id === filamentId);
          return (
            <div key={index} className="flex items-center gap-2">
              <span className="size-5 shrink-0 rounded-full border border-line" style={{ background: filament?.color_hex ?? "transparent" }} />
              <select
                className="input flex-1"
                aria-label={`Filamento ${index + 1}`}
                value={filamentId}
                onChange={(event) => setUsed(used.map((item, position) => (position === index ? event.target.value : item)))}
              >
                <option value="">Elegir…</option>
                {filaments.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.id !== filamentId && used.includes(item.id)}>
                    {filamentName(item)} · {money(costPerGram(item) * 1000)}/kg
                  </option>
                ))}
              </select>
              <button type="button" className="btn" aria-label="Quitar filamento" onClick={() => setUsed(used.filter((_, position) => position !== index))}>
                ✕
              </button>
            </div>
          );
        })}
        <button type="button" className="btn self-start" onClick={() => setUsed([...used, ""])}>
          + Otro filamento
        </button>
        {filaments.length === 0 && (
          <p className="text-sm text-muted">
            Primero da de alta tus filamentos en{" "}
            <Link href="/app/filamento" className="text-brand hover:underline">
              Filamento
            </Link>
            .
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">Impresoras y placas</legend>
        {printers.length === 0 ? (
          <p className="text-sm text-muted">
            Registra tus impresoras en{" "}
            <Link href="/app/impresoras" className="text-brand hover:underline">
              Impresoras
            </Link>{" "}
            para indicar en cuáles sale y sus placas.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted">Elige en qué impresoras sale. En cada una, agrega una placa por cada vez que hay que mandarla a imprimir.</p>
            <div className="flex flex-wrap gap-3">
              {printers.map((printer) => (
                <label key={printer.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={printerIds.includes(printer.id)} onChange={(event) => togglePrinter(printer.id, event.target.checked)} />
                  {printer.name}
                </label>
              ))}
            </div>
          </>
        )}
        {printerIds.map((printerId) => {
          const printer = printers.find((item) => item.id === printerId);
          if (!printer) return null;
          const rows = plates[printerId] ?? [];
          const total = recipeFor(draft, printerId);
          const others = printerIds.filter((id) => id !== printerId && plates[id]?.length);
          return (
            <div key={printerId} className="flex flex-col gap-3 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{printer.name}</p>
                {others.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="btn px-3 py-1 text-xs"
                    onClick={() => setPlates({ ...plates, [printerId]: plates[id].map((plate) => ({ ...plate, grams: { ...plate.grams } })) })}
                  >
                    Copiar placas de {printers.find((item) => item.id === id)?.name}
                  </button>
                ))}
              </div>
              {rows.map((plate, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 rounded-md bg-ink p-2 sm:grid-cols-4">
                  <label className="label col-span-2">
                    Placa
                    <input className="input" value={plate.name} onChange={(event) => setPlate(printerId, index, { name: event.target.value })} maxLength={40} />
                  </label>
                  <label className="label">
                    Horas
                    <input className="input" type="number" min={0} value={plate.hours} onChange={(event) => setPlate(printerId, index, { hours: event.target.value })} placeholder="0" />
                  </label>
                  <label className="label">
                    Minutos
                    <input className="input" type="number" min={0} value={plate.minutes} onChange={(event) => setPlate(printerId, index, { minutes: event.target.value })} placeholder="0" />
                  </label>
                  {usedIds.map((id) => {
                    const filament = filaments.find((item) => item.id === id);
                    return (
                      <label key={id} className="label">
                        <span className="flex items-center gap-1">
                          <span className="inline-block size-3 shrink-0 rounded-full border border-line" style={{ background: filament?.color_hex }} />
                          <span className="truncate">{filament ? filament.color || filamentName(filament) : "Filamento"} (g)</span>
                        </span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step="any"
                          value={plate.grams[id] ?? ""}
                          onChange={(event) => setPlate(printerId, index, { grams: { ...plate.grams, [id]: event.target.value } })}
                          placeholder="0"
                        />
                      </label>
                    );
                  })}
                  {usedIds.length === 0 && <p className="col-span-2 text-xs text-muted sm:col-span-4">Elige arriba los filamentos para anotar sus gramos.</p>}
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="btn col-span-2 justify-self-start text-xs sm:col-span-4"
                      onClick={() => setPlates({ ...plates, [printerId]: rows.filter((_, position) => position !== index) })}
                    >
                      Quitar {plate.name || "placa"}
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn self-start" onClick={() => setPlates({ ...plates, [printerId]: [...rows, emptyPlate(rows.length)] })}>
                + Agregar placa
              </button>
              <p className="text-sm text-muted">
                Total en {printer.name}: {rows.length} {rows.length === 1 ? "placa" : "placas"} · {duration(total.minutes)}
                {total.filaments.map((use) => {
                  const filament = filaments.find((item) => item.id === use.filament_id);
                  return ` · ${filament ? filament.color || filamentName(filament) : "Filamento"} ${Math.round(use.grams * 100) / 100} g`;
                })}{" "}
                · <strong>{money(costOnPrinter(draft, printer, filaments, profile?.kwh_price ?? 0).total)} por pieza</strong>
              </p>
            </div>
          );
        })}
      </fieldset>

      <label className="label">
        Otros costos por pieza ($)
        <input className="input" type="number" min={0} step="any" value={extraCost} onChange={(event) => setExtraCost(event.target.value)} placeholder="0" />
        <span className="font-normal">Tornillos, imanes, etiquetas… El embalaje para envío va aparte.</span>
      </label>
      {product ? (
        <div className="label">
          Piezas en stock: {product.stock}
          <span className="font-normal">
            Suben con cada impresión y bajan con cada venta. Para corregirlas usa «Arquear» en{" "}
            <Link href="/app/inventario" className="text-brand hover:underline">
              Inventario
            </Link>
            .
          </span>
        </div>
      ) : (
        <label className="label">
          Piezas que ya tienes
          <input className="input" type="number" step={1} value={stock} onChange={(event) => setStock(event.target.value)} />
          <span className="font-normal">Quedan en el historial como existencia inicial.</span>
        </label>
      )}

      <div className="flex flex-col gap-1 rounded-lg bg-ink p-3 sm:col-span-2">
        <Line label="Filamento" value={money(cost.filament)} />
        <Line label="Luz" value={money(cost.electricity)} />
        <Line label="Desgaste de máquina" value={money(cost.machine)} />
        <Line label="Otros" value={money(cost.extra)} />
        <Line strong label={printerIds.length > 1 ? "Costo por pieza (promedio de tus impresoras)" : "Costo por pieza"} value={money(cost.total)} />
      </div>

      <label className="label sm:col-span-2">
        Embalaje para envío
        <select className="input" value={packagingId} onChange={(event) => setPackagingId(event.target.value)}>
          <option value="">Sin embalaje</option>
          {packaging.map((item) => (
            <option key={item.id} value={item.id}>
              {packagingName(item)} · {money(item.cost)}
            </option>
          ))}
        </select>
        <span className="font-normal">
          {packaging.length ? "Con envío se suma este embalaje y el envío del canal." : "Registra tus cajas, sobres y bolsas en Embalaje."}
        </span>
      </label>

      {channels.map((channel) => {
        const price = num(prices[channel.id] ?? "");
        const margin = profile?.margin_pct ?? 0;
        const shipping = shippingCost(channel, box);
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
              placeholder={`Sugerido ${suggestedPrice(cost.total, channel, margin).toFixed(2)}`}
            />
            <span className="font-normal">
              {price > 0
                ? `Ganas ${money(unitProfit(price, cost.total, channel))} sin envío · ${money(unitProfit(price, cost.total, channel, shipping))} con envío`
                : `Sugerido con envío: ${money(suggestedPrice(cost.total, channel, margin, shipping))}`}
            </span>
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
  const { products, filaments, printers, channels, profile, packaging } = useData();
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  return (
    <>
      <PageHeader title="Productos">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo producto
        </button>
      </PageHeader>

      {products.length === 0 ? (
        <Empty>Da de alta tus productos con su foto, los filamentos que usan y sus placas en cada impresora.</Empty>
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
                      const shipping = shippingCost(channel, packaging.find((item) => item.id === product.packaging_id));
                      const margin = profile?.margin_pct ?? 0;
                      if (!price) {
                        return (
                          <td key={channel.id} className="num text-xs text-muted">
                            sugerido {money(suggestedPrice(cost, channel, margin))}
                            <div>con envío {money(suggestedPrice(cost, channel, margin, shipping))}</div>
                          </td>
                        );
                      }
                      const tone = (profit: number) => (profit >= 0 ? "text-money" : "text-bad");
                      const plain = unitProfit(price, cost, channel);
                      const shipped = unitProfit(price, cost, channel, shipping);
                      return (
                        <td key={channel.id} className="num">
                          {money(price)}
                          <div className={`text-xs ${tone(plain)}`}>sin envío gana {money(plain)}</div>
                          <div className={`text-xs ${tone(shipped)}`}>con envío gana {money(shipped)}</div>
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
