"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { CategoryPicker } from "@/components/app/CategoryPicker";
import { Empty, Line, Modal, PageHeader, TableCard } from "@/components/app/ui";
import {
  costPerGram,
  materialUnitCost,
  suppliesCost,
  filamentName,
  packagingName,
  plateCombos,
  piecesOnPlate,
  plateCost,
  productCost,
  shippingFor,
  shippingQuotes,
  suggestedPriceWithShipping,
  suggestedPrice,
  unitProfit,
  type Combo,
} from "@/lib/costs";
import { useData, useSave } from "@/lib/data";
import { duration, field, money, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { imageUrl, supabase, uploadProductImage } from "@/lib/supabase";
import type { Part, Plate, Product } from "@/lib/types";

/** A piece as typed. */
type PartRow = { id: string; name: string; needed: string };

/** A plate as typed: hours, minutes, grams and pieces stay text while editing. */
type PlateRow = { name: string; hours: string; minutes: string; grams: Record<string, string>; parts: Record<string, string> };

const newId = () => Math.random().toString(36).slice(2, 8);

const emptyPlate = (index: number, parts: PartRow[]): PlateRow => ({
  name: `Placa ${index + 1}`,
  hours: "",
  minutes: "",
  grams: {},
  // A product of a single piece prints one per plate unless told otherwise.
  parts: parts.length === 1 ? { [parts[0].id]: "1" } : {},
});

/** The pieces of the product; a single unnamed one when it never declared any. */
function partRowsOf(product: Product | undefined): PartRow[] {
  if (!product?.parts?.length) return [{ id: "pieza", name: "", needed: "1" }];
  return product.parts.map((part) => ({ id: part.id, name: part.name, needed: String(part.needed) }));
}

/** Plates by printer, as saved; older products get one plate per printer from their single recipe. */
function platesOf(product: Product | undefined): Record<string, PlateRow[]> {
  const rows: Record<string, PlateRow[]> = {};
  const whole = Object.fromEntries((product?.parts?.length ? product.parts : [{ id: "pieza", needed: 1 }]).map((part) => [part.id, part.needed]));
  const toRow = (plate: Pick<Plate, "name" | "minutes" | "grams" | "parts">): PlateRow => ({
    name: plate.name,
    hours: field(Math.floor(plate.minutes / 60)),
    minutes: field(plate.minutes % 60),
    grams: Object.fromEntries(Object.entries(plate.grams).map(([id, grams]) => [id, field(grams)])),
    parts: Object.fromEntries(Object.entries(plate.parts ?? whole).map(([id, count]) => [id, String(count)])),
  });
  if (product?.plates?.length) {
    for (const plate of product.plates) (rows[plate.printer_id] ??= []).push(toRow(plate));
  } else if (product) {
    const grams = Object.fromEntries(product.filaments.map((use) => [use.filament_id, use.grams]));
    for (const id of product.printer_ids) rows[id] = [toRow({ name: "Placa 1", minutes: product.print_minutes, grams })];
  }
  return rows;
}

/** Where each piece comes from and what it costs there; the product costs the sum. */
function ComboCard({ title, hint, combo }: { title: string; hint: string; combo: Combo }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
      <p className="text-sm font-semibold">
        {title} · {money(combo.cost.total)} por producto
      </p>
      <p className="text-xs text-muted">{hint}</p>
      <ul className="flex flex-col gap-0.5 text-sm">
        {combo.choices.map(({ part, plate, printer, perPiece }) => (
          <li key={part.id} className="flex justify-between gap-3">
            <span>
              {part.needed > 1 ? `${part.needed} × ` : ""}
              {part.name} <span className="text-muted">· {plate.name} en {printer.name}</span>
            </span>
            <span className="tabular-nums">{money(perPiece * part.needed)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const { session } = useSession();
  const { filaments, printers, channels, profile, packaging, materials, carriers } = useData();
  const { busy, error, setError, save } = useSave();
  const kwhPrice = profile?.kwh_price ?? 0;

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categories, setCategories] = useState<string[]>(product?.categories ?? []);
  // Supplies the product takes (LEDs, bulbs, screws…), from Insumos.
  const [supplies, setSupplies] = useState<{ material_id: string; quantity: string }[]>(
    product?.materials?.length ? product.materials.map((use) => ({ material_id: use.material_id, quantity: String(use.quantity) })) : [],
  );
  const [extraCost, setExtraCost] = useState(field(product?.extra_cost));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  // Photos in order (the first is the cover): saved ones by path, new ones as files to upload on save.
  const [photos, setPhotos] = useState<{ key: string; path?: string; file?: File; url: string }[]>(() =>
    [product?.image_path, ...(product?.image_paths ?? [])]
      .filter((path): path is string => Boolean(path))
      .map((path) => ({ key: path, path, url: imageUrl(path)! })),
  );
  // Pieces the product is made of; each plate says how many of each it prints.
  const [partRows, setPartRows] = useState<PartRow[]>(() => partRowsOf(product));
  // Filaments the product uses; each plate says how many grams of each it takes.
  const [used, setUsed] = useState<string[]>(product?.filaments.length ? product.filaments.map((use) => use.filament_id) : [""]);
  const [printerIds, setPrinterIds] = useState<string[]>(() => Object.keys(platesOf(product)));
  const [plates, setPlates] = useState<Record<string, PlateRow[]>>(() => platesOf(product));
  const [packagingId, setPackagingId] = useState(product?.packaging_id ?? "");
  const box = packaging.find((item) => item.id === packagingId);
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(product?.prices ?? {}).map(([channel, price]) => [channel, String(price)])),
  );

  const parts: Part[] = partRows.map((row, index) => ({
    id: row.id,
    name: row.name.trim() || (partRows.length === 1 ? "Pieza" : `Pieza ${index + 1}`),
    needed: Math.max(1, Math.round(num(row.needed))),
  }));
  const usedIds = [...new Set(used.filter(Boolean))];
  const savedPlates: Plate[] = printerIds.flatMap((printerId) =>
    (plates[printerId] ?? []).map((plate, index) => ({
      printer_id: printerId,
      name: plate.name.trim() || `Placa ${index + 1}`,
      minutes: Math.round(num(plate.hours) * 60 + num(plate.minutes)),
      grams: Object.fromEntries(usedIds.map((id) => [id, num(plate.grams[id] ?? "")])),
      parts: Object.fromEntries(parts.map((part) => [part.id, Math.max(0, Math.round(num(plate.parts[part.id] ?? "")))])),
    })),
  );
  const extra = num(extraCost);
  const savedSupplies = supplies.flatMap((row) => (row.material_id && num(row.quantity) > 0 ? [{ material_id: row.material_id, quantity: num(row.quantity) }] : []));
  const supplyCost = suppliesCost(savedSupplies, materials);

  // React Compiler memoizes this: the search only runs again when plates, pieces or costs change.
  const combos = plateCombos(
    { plates: savedPlates, parts, extra_cost: extra + supplyCost, filaments: [], printer_ids: [], print_minutes: 0 },
    filaments,
    printers,
    kwhPrice,
  );
  const dearest = combos.dearest;
  const cost = dearest?.cost ?? { filament: 0, electricity: 0, machine: 0, extra: extra + supplyCost, total: extra + supplyCost };

  const draft = {
    parts,
    plates: savedPlates,
    printer_ids: printerIds,
    // What falls on one product in the dearest way, for screens that do not know about plates.
    filaments: (dearest?.filaments ?? []).map((use) => ({ filament_id: use.filament_id, grams: Math.round(use.grams * 100) / 100 })),
    print_minutes: Math.round(dearest?.minutes ?? 0),
    extra_cost: extra,
    materials: savedSupplies,
  };

  const setPlate = (printerId: string, index: number, change: Partial<PlateRow>) =>
    setPlates({ ...plates, [printerId]: plates[printerId].map((plate, position) => (position === index ? { ...plate, ...change } : plate)) });

  const setPart = (index: number, change: Partial<PartRow>) => setPartRows(partRows.map((row, position) => (position === index ? { ...row, ...change } : row)));

  function togglePrinter(printerId: string, on: boolean) {
    setPrinterIds(on ? [...printerIds, printerId] : printerIds.filter((item) => item !== printerId));
    if (on && !plates[printerId]?.length) setPlates({ ...plates, [printerId]: [emptyPlate(0, partRows)] });
  }

  async function write() {
    const paths: string[] = [];
    for (const photo of photos) {
      if (photo.path) {
        paths.push(photo.path);
        continue;
      }
      const upload = await uploadProductImage(session!.user.id, photo.file!);
      if (upload.error) return { error: { message: `No se pudo subir ${photo.file!.name}: ${upload.error.message}` } };
      paths.push(upload.path);
    }
    const row = {
      name: name.trim(),
      sku: sku.trim(),
      description: description.trim(),
      categories,
      image_path: paths[0] ?? null,
      image_paths: paths.slice(1),
      ...draft,
      packaging_id: packagingId || null,
      prices: Object.fromEntries(Object.entries(prices).flatMap(([channel, price]) => (num(price) > 0 ? [[channel, num(price)]] : []))),
      // Stock is typed only for a new product; later prints, sales and arqueos move it.
      ...(product ? {} : { stock: Math.round(num(stock)) }),
    };
    const result = product
      ? await supabase().from("products").update(row).eq("id", product.id)
      : await supabase().from("products").insert(row);
    // Photos taken out of the product leave the storage too.
    const before = [product?.image_path, ...(product?.image_paths ?? [])].filter((path): path is string => Boolean(path));
    const dropped = before.filter((path) => !paths.includes(path));
    if (!result.error && dropped.length) await supabase().storage.from("products").remove(dropped);
    return result;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (partRows.length > 1 && partRows.some((row) => !row.name.trim())) return setError("Ponle nombre a cada pieza.");
    if (!usedIds.length) return setError("Indica qué filamentos usa el producto.");
    if (!printerIds.length) return setError("Elige al menos una impresora y llena sus placas.");
    for (const plate of savedPlates) {
      const where = `${plate.name} de ${printers.find((item) => item.id === plate.printer_id)?.name ?? "la impresora"}`;
      if (!Object.values(plate.parts ?? {}).some((count) => count > 0)) return setError(`Indica qué piezas salen en ${where}.`);
      if (plate.minutes <= 0) return setError(`Indica el tiempo de ${where}.`);
      if (!Object.values(plate.grams).some((grams) => grams > 0)) return setError(`Indica los gramos de filamento de ${where}.`);
    }
    if (combos.missing.length) return setError(`Ninguna placa imprime: ${combos.missing.map((part) => part.name).join(", ")}.`);
    if (!dearest) return setError("Con estas placas no se completa un producto.");
    save(write, onDone);
  }

  function remove() {
    if (!window.confirm(`Se eliminará "${product!.name}". Sus impresiones y ventas se conservan en el historial.`)) return;
    save(async () => {
      const result = await supabase().from("products").delete().eq("id", product!.id);
      const all = [product!.image_path, ...(product!.image_paths ?? [])].filter((path): path is string => Boolean(path));
      if (!result.error && all.length) await supabase().storage.from("products").remove(all);
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
      <div className="label sm:col-span-2">
        Categorías
        <span className="font-normal">Puede tener varias: una maceta también puede ser portalápices.</span>
        <CategoryPicker value={categories} onChange={setCategories} />
      </div>
      {/* Only the button opens the files: a label around the whole field caught clicks meant for other fields. */}
      <div className="label sm:col-span-2">
        Fotos
        <span className="font-normal">La primera es la portada. Usa «Portada» para cambiarla.</span>
        <div className="flex flex-wrap items-start gap-3 font-normal">
          {photos.map((photo, index) => (
            <div key={photo.key} className="flex w-24 flex-col gap-1">
              <div className={`relative size-24 overflow-hidden rounded-lg border ${index === 0 ? "border-brand" : "border-line"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local previews and public product photos */}
                <img src={photo.url} alt="" className="absolute inset-0 size-full object-cover" />
                {index === 0 && <span className="absolute left-1 top-1 rounded bg-brand px-1.5 text-[10px] font-semibold text-on-brand">Portada</span>}
              </div>
              <div className="flex gap-1">
                {index > 0 && (
                  <button
                    type="button"
                    className="btn flex-1 px-1 py-0.5 text-[11px]"
                    onClick={() => setPhotos([photo, ...photos.filter((_, position) => position !== index)])}
                  >
                    Portada
                  </button>
                )}
                <button
                  type="button"
                  className="btn flex-1 px-1 py-0.5 text-[11px]"
                  aria-label="Quitar foto"
                  onClick={() => setPhotos(photos.filter((_, position) => position !== index))}
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
          <input
            id="product-photo"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              setPhotos([...photos, ...files.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file) }))]);
              event.target.value = "";
            }}
          />
          <label htmlFor="product-photo" className="btn flex size-24 cursor-pointer flex-col items-center justify-center text-center text-xs">
            + Agregar fotos
          </label>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">Piezas del producto</legend>
        <p className="text-xs text-muted">De qué piezas se compone y cuántas lleva cada producto. Si es de una sola pieza, déjalo así.</p>
        {partRows.map((row, index) => (
          <div key={row.id} className="flex items-end gap-2">
            <label className="label flex-1">
              Pieza
              <input
                className="input"
                value={row.name}
                onChange={(event) => setPart(index, { name: event.target.value })}
                placeholder={partRows.length === 1 ? "Una sola pieza" : "Cuerpo, brazo, cola…"}
                maxLength={40}
              />
            </label>
            <label className="label w-36">
              Por producto
              <input className="input" type="number" min={1} step={1} value={row.needed} onChange={(event) => setPart(index, { needed: event.target.value })} />
            </label>
            {partRows.length > 1 && (
              <button type="button" className="btn" aria-label="Quitar pieza" onClick={() => setPartRows(partRows.filter((_, position) => position !== index))}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn self-start" onClick={() => setPartRows([...partRows, { id: newId(), name: "", needed: "1" }])}>
          + Otra pieza
        </button>
      </fieldset>

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
            <p className="text-xs text-muted">
              Elige en qué impresoras sale. En cada placa anota qué piezas salen y cuántas (por ejemplo 4 brazos y 5 colas), su tiempo y los gramos de cada
              filamento como te los da el laminador.
            </p>
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
                    onClick={() =>
                      setPlates({ ...plates, [printerId]: plates[id].map((plate) => ({ ...plate, grams: { ...plate.grams }, parts: { ...plate.parts } })) })
                    }
                  >
                    Copiar placas de {printers.find((item) => item.id === id)?.name}
                  </button>
                ))}
              </div>
              {rows.map((plate, index) => {
                const saved = savedPlates.filter((item) => item.printer_id === printerId)[index];
                return (
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
                    <p className="col-span-2 text-xs font-semibold text-muted sm:col-span-4">Piezas que salen en esta placa</p>
                    {parts.map((part) => (
                      <label key={part.id} className="label">
                        <span className="truncate">{part.name}</span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          step={1}
                          value={plate.parts[part.id] ?? ""}
                          onChange={(event) => setPlate(printerId, index, { parts: { ...plate.parts, [part.id]: event.target.value } })}
                          placeholder="0"
                        />
                      </label>
                    ))}
                    <p className="col-span-2 text-xs font-semibold text-muted sm:col-span-4">Filamento de toda la placa</p>
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
                    <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-4">
                      <span className="text-sm text-muted">
                        {saved &&
                          (() => {
                            const total = plateCost(saved, printer, filaments, kwhPrice).total;
                            const count = piecesOnPlate(saved, parts);
                            return count > 0
                              ? `Imprimirla cuesta ${money(total)} · ${money(total / count)} por pieza (${count} ${count === 1 ? "pieza" : "piezas"})`
                              : `Imprimirla cuesta ${money(total)}`;
                          })()}
                      </span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          className="btn text-xs"
                          onClick={() => setPlates({ ...plates, [printerId]: rows.filter((_, position) => position !== index) })}
                        >
                          Quitar {plate.name || "placa"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="btn self-start"
                onClick={() => setPlates({ ...plates, [printerId]: [...rows, emptyPlate(rows.length, partRows)] })}
              >
                + Agregar placa
              </button>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">Insumos que lleva</legend>
        <p className="text-xs text-muted">
          LEDs, focos, tornillos, imanes… y cuántos lleva cada producto. Su costo se suma solo y se descuentan de tus{" "}
          <Link href="/app/insumos" className="text-brand hover:underline">
            Insumos
          </Link>{" "}
          al producirlo.
        </p>
        {supplies.map((row, index) => {
          const material = materials.find((item) => item.id === row.material_id);
          return (
            <div key={index} className="flex items-end gap-2">
              <label className="label flex-1">
                Insumo
                <select
                  className="input"
                  value={row.material_id}
                  onChange={(event) => setSupplies(supplies.map((item, position) => (position === index ? { ...item, material_id: event.target.value } : item)))}
                >
                  <option value="">Elegir…</option>
                  {materials.map((item) => (
                    <option key={item.id} value={item.id} disabled={item.id !== row.material_id && supplies.some((other) => other.material_id === item.id)}>
                      {item.name} · {money(materialUnitCost(item))} c/u · quedan {Number(item.stock)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label w-32">
                Por producto
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  value={row.quantity}
                  onChange={(event) => setSupplies(supplies.map((item, position) => (position === index ? { ...item, quantity: event.target.value } : item)))}
                  placeholder="1"
                />
              </label>
              <span className="w-24 pb-3 text-right text-sm text-muted">{material ? money(materialUnitCost(material) * num(row.quantity)) : ""}</span>
              <button type="button" className="btn" aria-label="Quitar insumo" onClick={() => setSupplies(supplies.filter((_, position) => position !== index))}>
                ✕
              </button>
            </div>
          );
        })}
        {materials.length ? (
          <button type="button" className="btn self-start" onClick={() => setSupplies([...supplies, { material_id: "", quantity: "1" }])}>
            + Agregar insumo
          </button>
        ) : (
          <p className="text-sm text-muted">
            Primero da de alta tus insumos en{" "}
            <Link href="/app/insumos" className="text-brand hover:underline">
              Insumos
            </Link>
            .
          </p>
        )}
      </fieldset>

      <label className="label">
        Otros costos por producto ($)
        <input className="input" type="number" min={0} step="any" value={extraCost} onChange={(event) => setExtraCost(event.target.value)} placeholder="0" />
        <span className="font-normal">Lo que no llevas en Insumos: etiquetas, mano de obra… El embalaje para envío va aparte.</span>
      </label>
      {product ? (
        <div className="label">
          Productos en stock: {product.stock}
          <span className="font-normal">
            {parts.some((part) => (product.part_stock?.[part.id] ?? 0) > 0) &&
              `Piezas sueltas: ${parts
                .filter((part) => (product.part_stock?.[part.id] ?? 0) > 0)
                .map((part) => `${product.part_stock[part.id]} ${part.name}`)
                .join(", ")}. `}
            Suben con cada impresión y bajan con cada venta. Para corregirlas usa «Arquear» en{" "}
            <Link href="/app/inventario" className="text-brand hover:underline">
              Inventario
            </Link>
            .
          </span>
        </div>
      ) : (
        <label className="label">
          Productos que ya tienes
          <input className="input" type="number" step={1} value={stock} onChange={(event) => setStock(event.target.value)} />
          <span className="font-normal">Quedan en el historial como existencia inicial.</span>
        </label>
      )}

      <div className="flex flex-col gap-3 sm:col-span-2">
        {combos.missing.length > 0 && printerIds.length > 0 && (
          <p className="text-sm text-warn">Ninguna placa imprime todavía: {combos.missing.map((part) => part.name).join(", ")}.</p>
        )}
        {dearest && (
          <div className="grid gap-3 sm:grid-cols-2">
            <ComboCard title="Combinación más cara" hint="Cada pieza desde la placa donde sale más cara. Es el costo que usa el producto, para que tus precios siempre alcancen." combo={dearest} />
            {combos.cheapest && (
              <ComboCard title="Combinación más barata" hint="Cada pieza desde la placa donde sale más barata." combo={combos.cheapest} />
            )}
          </div>
        )}
        <div className="flex flex-col gap-1 rounded-lg bg-ink p-3">
          <Line label="Filamento" value={money(cost.filament)} />
          <Line label="Luz" value={money(cost.electricity)} />
          <Line label="Desgaste de máquina" value={money(cost.machine)} />
          {supplyCost > 0 && <Line label="Insumos" value={money(supplyCost)} />}
          <Line label="Otros" value={money(cost.extra - supplyCost)} />
          <Line strong label="Costo por producto (combinación más cara)" value={money(cost.total)} />
          <p className="mt-1 text-xs text-muted">
            Luz = horas de impresión × consumo de la impresora (watts) × precio del kWh. Desgaste = horas × el desgaste por hora de la impresora (lo que
            costó ÷ su vida útil). Ambos por la parte de la placa que toca a cada pieza.
          </p>
          {!kwhPrice && (
            <p className="text-xs text-warn">
              La luz sale en $0 porque falta el precio del kWh: ponlo en{" "}
              <Link href="/app/ajustes" className="underline">
                Ajustes
              </Link>{" "}
              (viene en tu recibo de luz).
            </p>
          )}
        </div>
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
          {box && (() => {
            // Shipping weight: the plastic of one product plus the empty package.
            const grams = draft.filaments.reduce((total, use) => total + use.grams, 0);
            return ` Peso para envío: ${Math.round(grams)} g del producto + ${Number(box.weight_g ?? 0)} g del empaque = ${Math.round(grams + Number(box.weight_g ?? 0))} g.${box.stock <= 0 ? " Ojo: no te quedan de este empaque." : ` Te quedan ${box.stock}.`}`;
          })()}
        </span>
      </label>

      {channels.map((channel) => {
        const price = num(prices[channel.id] ?? "");
        const margin = profile?.margin_pct ?? 0;
        // Shipping is quoted with the channel's carriers for this weight and box (and price, when they charge by it).
        const grams = draft.filaments.reduce((total, use) => total + use.grams, 0);
        const shippingAt = (at: number) => shippingFor(channel, carriers, grams, box, at);
        const suggestedShipped = suggestedPriceWithShipping(cost.total, channel, margin, shippingAt);
        const quotes = shippingQuotes(channel, carriers, grams, box, price > 0 ? price : suggestedShipped);
        const shipping = shippingAt(price > 0 ? price : suggestedShipped);
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
                : `Sugerido con envío: ${money(suggestedShipped)}`}
            </span>
            {quotes.length > 0 && (
              <span className="font-normal">
                {quotes.length === 1
                  ? `Envío con ${quotes[0].carrier.name}: ${money(quotes[0].cost)}`
                  : `Envío más barato: ${money(quotes[0].cost)} (${quotes[0].carrier.name}) · más caro: ${money(quotes[quotes.length - 1].cost)} (${quotes[quotes.length - 1].carrier.name})`}
                {` · cobra ${quotes[quotes.length - 1].kg.toFixed(2)} kg`}
                {box ? "" : " (sin caja asignada: solo el peso del producto)"}
              </span>
            )}
            {channel.carrier_ids?.length > 0 && quotes.length === 0 && (
              <span className="font-normal text-warn">Ninguna paquetería de este canal tiene tarifa para este peso: se usa el envío fijo del canal.</span>
            )}
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
  const { products, filaments, printers, channels, profile, packaging, materials, carriers } = useData();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  // Only the products of one category; "" = all.
  const [category, setCategory] = useState("");
  const used = [...new Set(products.flatMap((product) => product.categories ?? []))].sort((a, b) => a.localeCompare(b, "es"));
  const shown = category ? products.filter((product) => product.categories?.includes(category)) : products;

  return (
    <>
      <PageHeader title="Productos">
        {used.length > 0 && (
          <select className="input w-auto" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            {used.map((name) => (
              <option key={name} value={name}>
                {name} ({products.filter((product) => product.categories?.includes(name)).length})
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo producto
        </button>
      </PageHeader>

      {products.length === 0 ? (
        <Empty>Da de alta tus productos con su foto, sus piezas, los filamentos que usan y sus placas en cada impresora.</Empty>
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
              {shown.map((product) => {
                const cost = productCost(product, filaments, printers, profile?.kwh_price ?? 0, materials).total;
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
                          {product.categories?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {product.categories.map((name) => (
                                <span key={name} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="num text-muted">{duration(product.print_minutes)}</td>
                    <td className="num">{money(cost)}</td>
                    {channels.map((channel) => {
                      const price = product.prices[channel.id];
                      const box = packaging.find((item) => item.id === product.packaging_id);
                      const grams = product.filaments.reduce((total, use) => total + use.grams, 0);
                      const shippingAt = (at: number) => shippingFor(channel, carriers, grams, box, at);
                      const margin = profile?.margin_pct ?? 0;
                      if (!price) {
                        return (
                          <td key={channel.id} className="num text-xs text-muted">
                            sugerido {money(suggestedPrice(cost, channel, margin))}
                            <div>con envío {money(suggestedPriceWithShipping(cost, channel, margin, shippingAt))}</div>
                          </td>
                        );
                      }
                      const tone = (profit: number) => (profit >= 0 ? "text-money" : "text-bad");
                      const plain = unitProfit(price, cost, channel);
                      const shipped = unitProfit(price, cost, channel, shippingAt(price));
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
