"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { BoxAdvisor, ParcelFacts, type SizeDraft } from "@/components/app/BoxAdvisor";
import { CategoryPicker } from "@/components/app/CategoryPicker";
import { FilamentPicker } from "@/components/app/FilamentPicker";
import { InfoTip, TipLine } from "@/components/app/InfoTip";
import { SliceImport, type SliceImportResult } from "@/components/app/SliceImport";
import { Swatch } from "@/components/app/Swatch";
import { Empty, Line, Modal, PageHeader, Switch, TableCard } from "@/components/app/ui";
import {
  channelFees,
  channelPct,
  materialUnitCost,
  overheadPerPiece,
  suppliesCost,
  filamentName,
  packagingName,
  plateCombos,
  piecesOnPlate,
  wastePct,
  plateCost,
  productCost,
  shippingFor,
  shippingQuotes,
  suggestedPriceWithShipping,
  suggestedPrice,
  unitProfit,
  levelOf,
  levelPrices,
  priceLevels,
  LEVEL_LABEL,
  type Combo,
  type PriceLevels,
} from "@/lib/costs";
import { LevelPricesInfo, LevelsFields, draftOf, readLevels } from "@/components/app/PriceLevels";
import { useData, useSave } from "@/lib/data";
import { filamentColors } from "@/lib/labels";
import { duration, field, money, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { imageUrl, supabase, uploadProductImage } from "@/lib/supabase";
import type { Part, Plate, Printer, Product } from "@/lib/types";

/** Tabs of the product form. */
const SECTIONS = [
  ["general", "General"],
  ["impresion", "Impresión"],
  ["costos", "Costos"],
  ["embalaje", "Embalaje"],
  ["precios", "Precios"],
] as const;
type Section = (typeof SECTIONS)[number][0];

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

/** A printer's model as shown to the user ("Bambu Lab A1"), without the device id. */
function modelName(printer: Printer) {
  return `${printer.brand} ${printer.model}`.trim() || printer.name.split("·")[0].trim();
}

/**
 * The workshop's printers grouped by model: plates are typed once per model and any printer of that model can
 * print them. `id` is the model's first printer, which keys the plates while editing.
 */
function modelsOf(printers: Printer[]) {
  const groups: { id: string; name: string; ids: string[] }[] = [];
  for (const printer of printers) {
    const name = modelName(printer);
    const same = groups.find((group) => group.name.toLowerCase() === name.toLowerCase());
    if (same) same.ids.push(printer.id);
    else groups.push({ id: printer.id, name, ids: [printer.id] });
  }
  return groups;
}

/**
 * Plates by model (keyed by the model's first printer), as saved; older products get one plate per model from
 * their single recipe. Plates saved per printer of the same model are the same, so the first printer's are taken.
 */
function platesOf(product: Product | undefined, printers: Printer[]): Record<string, PlateRow[]> {
  const models = modelsOf(printers);
  const modelOf = (printerId: string) => models.find((group) => group.ids.includes(printerId));
  const source: Record<string, string> = {};
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
    for (const plate of product.plates) {
      const model = modelOf(plate.printer_id);
      if (!model || (source[model.id] ??= plate.printer_id) !== plate.printer_id) continue;
      (rows[model.id] ??= []).push(toRow(plate));
    }
  } else if (product) {
    const grams = Object.fromEntries(product.filaments.map((use) => [use.filament_id, use.grams]));
    for (const id of product.printer_ids) {
      const model = modelOf(id);
      if (model && !rows[model.id]) rows[model.id] = [toRow({ name: "Placa 1", minutes: product.print_minutes, grams })];
    }
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
              {part.name}{" "}
              <span className="text-muted">
                · {plate.name} en {modelName(printer)}
              </span>
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
  const { filaments, printers, channels, profile, packaging, materials, carriers, shop } = useData();
  const { busy, error, setError, save } = useSave();
  // The form goes in tabs: general data, printing, costs, packaging and prices.
  const [section, setSection] = useState<Section>("general");
  const part = (id: Section) => (section === id ? "contents" : "hidden");
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
  // Printer models the product prints on (each keyed by its first printer), shown as tabs.
  const models = modelsOf(printers);
  const idsOfModel = (modelId: string) => models.find((group) => group.id === modelId)?.ids ?? [modelId];
  const modelLabel = (printerId: string) => models.find((group) => group.ids.includes(printerId))?.name ?? "la impresora";
  const [printerIds, setPrinterIds] = useState<string[]>(() => Object.keys(platesOf(product, printers)));
  const [plates, setPlates] = useState<Record<string, PlateRow[]>>(() => platesOf(product, printers));
  const [tab, setTab] = useState<string>(() => Object.keys(platesOf(product, printers))[0] ?? "");
  const [adding, setAdding] = useState(false);
  // Plate open in the current printer's tabs.
  const [plateTab, setPlateTab] = useState(0);
  const activeTab = printerIds.includes(tab) ? tab : (printerIds[0] ?? "");
  const [packagingId, setPackagingId] = useState(product?.packaging_id ?? "");
  const box = packaging.find((item) => item.id === packagingId);
  // The finished product's size and its protection, in cm, to recommend a box (only once the database has them).
  const withSizes = product ? product.length_mm !== undefined : profile?.client_fields !== undefined;
  const [sizeDraft, setSizeDraft] = useState<SizeDraft>({
    length: field(product?.length_mm ? product.length_mm / 10 : 0),
    width: field(product?.width_mm ? product.width_mm / 10 : 0),
    height: field(product?.height_mm ? product.height_mm / 10 : 0),
    margin: String((product?.pack_margin_mm ?? 30) / 10),
  });
  const [sizeHint, setSizeHint] = useState<string | undefined>(undefined);
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(product?.prices ?? {}).map(([channel, price]) => [channel, String(price)])),
  );
  // Where it is listed in each channel; the public catalog shows these as buttons.
  const [links, setLinks] = useState<Record<string, string>>(product?.links ?? {});
  const [inCatalog, setInCatalog] = useState(product?.in_catalog ?? true);
  // Profit levels: the workshop's, or ones of its own (only those that differ are saved, the rest follow the workshop).
  const workshopLevels = priceLevels(profile);
  const [ownLevels, setOwnLevels] = useState(Object.keys(product?.price_levels ?? {}).length > 0);
  const [levelsDraft, setLevelsDraft] = useState(() => draftOf(priceLevels(profile, product)));
  const typedLevels = readLevels(levelsDraft);
  const levels = ownLevels && "levels" in typedLevels ? typedLevels.levels : workshopLevels;

  const parts: Part[] = partRows.map((row, index) => ({
    id: row.id,
    name: row.name.trim() || (partRows.length === 1 ? "Pieza" : `Pieza ${index + 1}`),
    needed: Math.max(1, Math.round(num(row.needed))),
  }));
  const usedIds = [...new Set(used.filter(Boolean))];
  // A slot without a filament, or with one that was deleted from Filamento: its grams cost nothing.
  const missing = (id: string) => !id || !filaments.some((item) => item.id === id);
  const missingCount = used.filter(missing).length;
  // The plates of a model are saved for each of its printers: any of them can print the product.
  const savedPlates: Plate[] = printerIds.flatMap((modelId) =>
    idsOfModel(modelId).flatMap((printerId) =>
      (plates[modelId] ?? []).map((plate, index) => ({
        printer_id: printerId,
        name: plate.name.trim() || `Placa ${index + 1}`,
        minutes: Math.round(num(plate.hours) * 60 + num(plate.minutes)),
        grams: Object.fromEntries(usedIds.map((id) => [id, num(plate.grams[id] ?? "")])),
        parts: Object.fromEntries(parts.map((part) => [part.id, Math.max(0, Math.round(num(plate.parts[part.id] ?? "")))])),
      })),
    ),
  );
  // Chosen filaments that no plate weighs: they add nothing to the cost.
  const unweighed = savedPlates.length
    ? usedIds.flatMap((id) => (savedPlates.some((plate) => (plate.grams[id] ?? 0) > 0) ? [] : filaments.filter((item) => item.id === id)))
    : [];
  const extra = num(extraCost);
  const savedSupplies = supplies.flatMap((row) =>
    row.material_id && num(row.quantity) > 0 ? [{ material_id: row.material_id, quantity: num(row.quantity) }] : [],
  );
  const supplyCost = suppliesCost(savedSupplies, materials);

  // React Compiler memoizes this: the search only runs again when plates, pieces or costs change.
  const combos = plateCombos(
    { plates: savedPlates, parts, extra_cost: extra + supplyCost, filaments: [], printer_ids: [], print_minutes: 0 },
    filaments,
    printers,
    kwhPrice,
    profile?.waste_rules,
  );
  const dearest = combos.dearest;
  // Each piece's share of the workshop's fixed costs (Ajustes → Gastos fijos).
  const share = overheadPerPiece(profile);
  const made = dearest?.cost ?? { filament: 0, electricity: 0, machine: 0, extra: extra + supplyCost, total: extra + supplyCost };
  const cost = { ...made, overhead: share, total: made.total + share };

  const draft = {
    parts,
    plates: savedPlates,
    printer_ids: printerIds.flatMap(idsOfModel),
    // What falls on one product in the dearest way, for screens that do not know about plates.
    filaments: (dearest?.filaments ?? []).map((use) => ({ filament_id: use.filament_id, grams: Math.round(use.grams * 100) / 100 })),
    print_minutes: Math.round(dearest?.minutes ?? 0),
    extra_cost: extra,
    materials: savedSupplies,
  };

  const setPlate = (printerId: string, index: number, change: Partial<PlateRow>) =>
    setPlates({ ...plates, [printerId]: plates[printerId].map((plate, position) => (position === index ? { ...plate, ...change } : plate)) });

  const setPart = (index: number, change: Partial<PartRow>) => setPartRows(partRows.map((row, position) => (position === index ? { ...row, ...change } : row)));

  /** Fills the plates of one printer from a sliced file; empty plates are replaced, filled ones kept. */
  function applySlice({ printerId: slicedOn, plates: imported, parts: found, thumbnail, biggest }: SliceImportResult) {
    // The biggest piece suggests the product's size while none was typed.
    if (biggest && !num(sizeDraft.length) && !num(sizeDraft.width) && !num(sizeDraft.height)) {
      const cmOf = (value: number) => String(Math.round(value) / 10);
      setSizeDraft({ ...sizeDraft, length: cmOf(biggest[0]), width: cmOf(biggest[1]), height: cmOf(biggest[2]) });
      setSizeHint("Las tomamos de la pieza más grande del archivo. Si el producto se arma con varias piezas, ajústalas.");
    }
    // The pieces found become the product's: same name → same piece; the single unnamed one takes the first.
    let pieceRows = partRows;
    const idOf: Record<string, string> = {};
    for (const part of found) {
      const same = pieceRows.find((row) => row.name.trim().toLowerCase() === part.name.toLowerCase());
      const blank = pieceRows.length === 1 && !pieceRows[0].name.trim() ? pieceRows[0] : null;
      if (same) idOf[part.name] = same.id;
      else if (blank) {
        idOf[part.name] = blank.id;
        pieceRows = [{ ...blank, name: part.name, needed: String(part.needed) }];
      } else {
        const id = newId();
        idOf[part.name] = id;
        pieceRows = [...pieceRows, { id, name: part.name, needed: String(part.needed) }];
      }
    }
    if (pieceRows !== partRows) setPartRows(pieceRows);
    const piecesOf = (plate: SliceImportResult["plates"][number]): Record<string, string> => {
      if (found.length) return Object.fromEntries(Object.entries(plate.pieces).map(([name, count]) => [idOf[name], String(count)]));
      // The file does not name its objects: with a single piece, every object is one.
      return pieceRows.length === 1 && plate.objects > 0 ? { [pieceRows[0].id]: String(plate.objects) } : {};
    };
    const rows: PlateRow[] = imported.map((plate) => ({
      name: plate.name,
      hours: field(Math.floor(plate.minutes / 60)),
      minutes: field(plate.minutes % 60),
      grams: Object.fromEntries(Object.entries(plate.grams).map(([id, grams]) => [id, field(grams)])),
      parts: piecesOf(plate),
    }));
    const printerId = models.find((group) => group.ids.includes(slicedOn))?.id ?? slicedOn;
    setTab(printerId);
    const current = (plates[printerId] ?? []).filter((plate) => plate.hours || plate.minutes || Object.values(plate.grams).some((grams) => num(grams) > 0));
    // Numbered after the plates the printer already had.
    const numbered = [...current, ...rows].map((plate, index) =>
      current.length && /^Placa \d+$/.test(plate.name) ? { ...plate, name: `Placa ${index + 1}` } : plate,
    );
    setPlates({ ...plates, [printerId]: numbered });
    if (!printerIds.includes(printerId)) setPrinterIds([...printerIds, printerId]);
    const ids = imported.flatMap((plate) => Object.keys(plate.grams));
    setUsed([...new Set([...used.filter(Boolean), ...ids])]);
    if (thumbnail && photos.length === 0) setPhotos([{ key: `placa-${newId()}`, file: thumbnail, url: URL.createObjectURL(thumbnail) }]);
  }

  function addModel(modelId: string) {
    setAdding(false);
    if (!modelId) return;
    setPrinterIds([...printerIds, modelId]);
    if (!plates[modelId]?.length) setPlates({ ...plates, [modelId]: [emptyPlate(0, partRows)] });
    setTab(modelId);
  }

  function closeModel(modelId: string) {
    const count = plates[modelId]?.length ?? 0;
    if (!confirm(`¿Quitar ${modelLabel(modelId)} de este producto? Se borran sus ${count} ${count === 1 ? "placa" : "placas"}.`)) return;
    setPrinterIds(printerIds.filter((item) => item !== modelId));
    const rest = { ...plates };
    delete rest[modelId];
    setPlates(rest);
  }

  async function write() {
    const paths: string[] = [];
    for (const photo of photos) {
      if (photo.path) {
        paths.push(photo.path);
        continue;
      }
      const upload = await uploadProductImage(shop?.shop_id ?? session!.user.id, photo.file!);
      if (upload.error) return { error: { message: `No se pudo subir ${photo.file!.name}: ${upload.error.message}` } };
      paths.push(upload.path);
    }
    if (ownLevels && "error" in typedLevels) return { error: { message: typedLevels.error } };
    const ownOnly =
      ownLevels && "levels" in typedLevels
        ? Object.fromEntries(
            (Object.keys(workshopLevels) as (keyof PriceLevels)[]).flatMap((key) =>
              typedLevels.levels[key] !== workshopLevels[key] ? [[key, typedLevels.levels[key]]] : [],
            ),
          )
        : {};
    const row = {
      name: name.trim(),
      sku: sku.trim(),
      description: description.trim(),
      categories,
      image_path: paths[0] ?? null,
      image_paths: paths.slice(1),
      ...draft,
      packaging_id: packagingId || null,
      ...(withSizes
        ? {
            length_mm: Math.round(num(sizeDraft.length) * 10),
            width_mm: Math.round(num(sizeDraft.width) * 10),
            height_mm: Math.round(num(sizeDraft.height) * 10),
            pack_margin_mm: Math.min(500, Math.max(0, Math.round(num(sizeDraft.margin) * 10))),
          }
        : {}),
      prices: Object.fromEntries(Object.entries(prices).flatMap(([channel, price]) => (num(price) > 0 ? [[channel, num(price)]] : []))),
      links: Object.fromEntries(
        Object.entries(links).flatMap(([channel, link]) => (link.trim() && channels.some((item) => item.id === channel) ? [[channel, link.trim()]] : [])),
      ),
      in_catalog: inCatalog,
      price_levels: Object.keys(ownOnly).length ? ownOnly : null,
      // Stock is typed only for a new product; later prints, sales and arqueos move it.
      ...(product ? {} : { stock: Math.round(num(stock)) }),
    };
    const result = product ? await supabase().from("products").update(row).eq("id", product.id) : await supabase().from("products").insert(row);
    // Photos taken out of the product leave the storage too.
    const before = [product?.image_path, ...(product?.image_paths ?? [])].filter((path): path is string => Boolean(path));
    const dropped = before.filter((path) => !paths.includes(path));
    if (!result.error && dropped.length) await supabase().storage.from("products").remove(dropped);
    return result;
  }

  function submit(event: React.FormEvent) {
    // Shows the error and opens the tab where it is.
    const fail = (where: Section, message: string) => {
      setSection(where);
      setError(message);
    };
    event.preventDefault();
    if (partRows.length > 1 && partRows.some((row) => !row.name.trim())) return fail("impresion", "Ponle nombre a cada pieza.");
    if (!usedIds.length) return fail("impresion", "Indica qué filamentos usa el producto.");
    if (missingCount) return fail("impresion", "Falta elegir un filamento (está marcado en rojo). Elígelo o quítalo con ✕.");
    if (!printerIds.length) return fail("impresion", "Elige al menos una impresora y llena sus placas.");
    for (const plate of savedPlates) {
      const where = `${plate.name} de ${modelLabel(plate.printer_id)}`;
      const model = models.find((group) => group.ids.includes(plate.printer_id))?.id;
      if (
        model &&
        (!Object.values(plate.parts ?? {}).some((count) => count > 0) || plate.minutes <= 0 || !Object.values(plate.grams).some((grams) => grams > 0))
      )
        setTab(model);
      if (!Object.values(plate.parts ?? {}).some((count) => count > 0)) return fail("impresion", `Indica qué piezas salen en ${where}.`);
      if (plate.minutes <= 0) return fail("impresion", `Indica el tiempo de ${where}.`);
      if (!Object.values(plate.grams).some((grams) => grams > 0)) return fail("impresion", `Indica los gramos de filamento de ${where}.`);
    }
    if (combos.missing.length) return fail("impresion", `Ninguna placa imprime: ${combos.missing.map((part) => part.name).join(", ")}.`);
    if (!dearest) return fail("impresion", "Con estas placas no se completa un producto.");
    const badLink = channels.find((channel) => (links[channel.id] ?? "").trim() && !/^https?:\/\/\S+\.\S+$/i.test(links[channel.id].trim()));
    if (badLink) return fail("precios", `El enlace de ${badLink.name} debe empezar con https:// (cópialo de tu publicación).`);
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
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line sm:col-span-2">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold ${section === id ? "border-line bg-raised text-brand" : "border-transparent text-muted hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={part("general")}>
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
          <textarea className="input" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} />
          <span className="font-normal">Se muestra en tu catálogo al abrir el producto.</span>
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
                  {index === 0 && <span className="absolute left-1 top-1 rounded bg-brand px-1.5 text-[10px] font-semibold text-ink">Portada</span>}
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
      </div>

      <div className={part("impresion")}>
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
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={1}
                  value={row.needed}
                  onChange={(event) => setPart(index, { needed: event.target.value })}
                />
              </label>
              {partRows.length > 1 && (
                <button
                  type="button"
                  className="btn"
                  aria-label="Quitar pieza"
                  onClick={() => setPartRows(partRows.filter((_, position) => position !== index))}
                >
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
                <Swatch colors={filament ? filamentColors(filament) : []} glow={filament?.glow} className="size-5 shrink-0 rounded-full border border-line" />
                <FilamentPicker
                  filaments={filaments}
                  value={filamentId}
                  taken={used}
                  label={`Filamento ${index + 1}`}
                  onChange={(id) => {
                    setUsed(used.map((item, position) => (position === index ? id : item)));
                    // Replacing a deleted filament keeps the grams typed for it in every plate.
                    if (filamentId && missing(filamentId))
                      setPlates(
                        Object.fromEntries(
                          Object.entries(plates).map(([key, rows]) => [
                            key,
                            rows.map((plate) => {
                              const { [filamentId]: grams, ...rest } = plate.grams;
                              return grams === undefined ? plate : { ...plate, grams: { ...rest, [id]: grams } };
                            }),
                          ]),
                        ),
                      );
                  }}
                />
                <button type="button" className="btn" aria-label="Quitar filamento" onClick={() => setUsed(used.filter((_, position) => position !== index))}>
                  ✕
                </button>
              </div>
            );
          })}
          {missingCount > 0 && filaments.length > 0 && (
            <p role="alert" className="error">
              Falta elegir {missingCount === 1 ? "un filamento" : `${missingCount} filamentos`} (vacío o borrado de Filamento). Mientras falte, sus gramos no se
              cuentan y el precio sale más bajo de lo real. Elígelo (los gramos que ya anotaste pasan al nuevo) o quítalo con ✕.
            </p>
          )}
          {unweighed.length > 0 && (
            <p role="alert" className="error">
              {unweighed.map((filament) => filamentName(filament)).join(", ")} no {unweighed.length === 1 ? "tiene" : "tienen"} gramos en ninguna placa: no suma
              al costo. Anota sus gramos abajo o quítalo.
            </p>
          )}
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
              <SliceImport filaments={filaments} printers={printers} onApply={applySlice} />
              <p className="text-xs text-muted">
                Agrega los modelos de impresora en que sale (cualquier impresora de ese modelo lo puede imprimir). En cada placa anota qué piezas salen y
                cuántas (por ejemplo 4 brazos y 5 colas), su tiempo y los gramos de cada filamento como te los da el laminador.
              </p>
              <div role="tablist" className="flex flex-wrap items-end gap-1 border-b border-line">
                {printerIds.map((modelId) => (
                  <div
                    key={modelId}
                    className={`flex items-center rounded-t-lg border border-b-0 text-sm ${modelId === activeTab ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-white"}`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={modelId === activeTab}
                      className="py-2 pl-3 pr-1 font-semibold"
                      onClick={() => {
                        setTab(modelId);
                        setPlateTab(0);
                      }}
                    >
                      {modelLabel(modelId)}
                      <span className="ml-1 text-xs font-normal opacity-70">({plates[modelId]?.length ?? 0})</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar ${modelLabel(modelId)}`}
                      title="Quitar esta impresora"
                      className="px-2 py-2 hover:text-bad"
                      onClick={() => closeModel(modelId)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {models.some((group) => !printerIds.includes(group.id)) &&
                  (adding ? (
                    <select
                      className="input mb-1 w-auto"
                      style={{ width: "auto" }}
                      autoFocus
                      defaultValue=""
                      onChange={(event) => addModel(event.target.value)}
                      onBlur={() => setAdding(false)}
                    >
                      <option value="" disabled>
                        Elige la impresora…
                      </option>
                      {models
                        .filter((group) => !printerIds.includes(group.id))
                        .map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                            {group.ids.length > 1 ? ` (tienes ${group.ids.length})` : ""}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <button type="button" className="btn mb-1 px-3 py-1.5 text-sm" onClick={() => setAdding(true)}>
                      + Agregar impresora
                    </button>
                  ))}
              </div>
              {printerIds.length === 0 && <p className="text-sm text-muted">Agrega la impresora en que sale para anotar sus placas.</p>}
            </>
          )}
          {printerIds.map((printerId) => {
            const printer = printers.find((item) => item.id === printerId);
            if (!printer || printerId !== activeTab) return null;
            const rows = plates[printerId] ?? [];
            const others = printerIds.filter((id) => id !== printerId && plates[id]?.length);
            return (
              <div key={printerId} className="flex flex-col gap-3 rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{modelLabel(printerId)}</p>
                  {others.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="btn px-3 py-1 text-xs"
                      onClick={() =>
                        setPlates({ ...plates, [printerId]: plates[id].map((plate) => ({ ...plate, grams: { ...plate.grams }, parts: { ...plate.parts } })) })
                      }
                    >
                      Copiar placas de {modelLabel(id)}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div role="tablist" aria-orientation="vertical" className="flex shrink-0 gap-1 overflow-x-auto sm:w-44 sm:flex-col sm:overflow-visible">
                    {rows.map((plate, index) => {
                      const time = Math.round(num(plate.hours) * 60 + num(plate.minutes));
                      const pieces = Object.values(plate.parts).reduce((total, count) => total + Math.max(0, Math.round(num(count))), 0);
                      const open = index === Math.min(plateTab, rows.length - 1);
                      return (
                        <button
                          key={index}
                          type="button"
                          role="tab"
                          aria-selected={open}
                          onClick={() => setPlateTab(index)}
                          className={`flex shrink-0 flex-col rounded-lg border px-3 py-2 text-left text-sm ${open ? "border-brand bg-brand/15 text-brand" : "border-line text-muted hover:text-white"}`}
                        >
                          <span className="font-semibold">{plate.name || `Placa ${index + 1}`}</span>
                          <span className="text-xs opacity-80">
                            {time > 0 ? duration(time) : "sin tiempo"} · {pieces} {pieces === 1 ? "pieza" : "piezas"}
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="btn shrink-0 text-sm"
                      onClick={() => {
                        setPlates({ ...plates, [printerId]: [...rows, emptyPlate(rows.length, partRows)] });
                        setPlateTab(rows.length);
                      }}
                    >
                      + Agregar placa
                    </button>
                  </div>
                  {rows.map((plate, index) => {
                    if (index !== Math.min(plateTab, rows.length - 1)) return null;
                    const saved = savedPlates.filter((item) => item.printer_id === printerId)[index];
                    return (
                      <div key={index} className="grid flex-1 grid-cols-2 content-start gap-2 rounded-md bg-ink p-3 sm:grid-cols-4">
                        <label className="label col-span-2">
                          Placa
                          <input
                            className="input"
                            value={plate.name}
                            onChange={(event) => setPlate(printerId, index, { name: event.target.value })}
                            maxLength={40}
                          />
                        </label>
                        <label className="label">
                          Horas
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={plate.hours}
                            onChange={(event) => setPlate(printerId, index, { hours: event.target.value })}
                            placeholder="0"
                          />
                        </label>
                        <label className="label">
                          Minutos
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={plate.minutes}
                            onChange={(event) => setPlate(printerId, index, { minutes: event.target.value })}
                            placeholder="0"
                          />
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
                                <Swatch
                                  colors={filament ? filamentColors(filament) : []}
                                  glow={filament?.glow}
                                  className="inline-block size-3 shrink-0 rounded-full border border-line"
                                />
                                <span className="truncate">
                                  {filament ? filament.color || filamentName(filament) : <span className="text-bad">⚠ Filamento borrado</span>} (g)
                                </span>
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
                        {usedIds.length === 0 && (
                          <p className="col-span-2 text-xs text-muted sm:col-span-4">Elige arriba los filamentos para anotar sus gramos.</p>
                        )}
                        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-4">
                          <span className="text-sm text-muted">
                            {saved &&
                              (() => {
                                const count = piecesOnPlate(saved, parts);
                                const waste = wastePct(profile?.waste_rules, count);
                                const total = plateCost(saved, printer, filaments, kwhPrice, waste).total;
                                const extraNote = waste > 0 ? ` · incluye ${waste}% de merma en filamento` : "";
                                return count > 0
                                  ? `Imprimirla cuesta ${money(total)} · ${money(total / count)} por pieza (${count} ${count === 1 ? "pieza" : "piezas"})${extraNote}`
                                  : `Imprimirla cuesta ${money(total)}`;
                              })()}
                          </span>
                          {rows.length > 1 && (
                            <button
                              type="button"
                              className="btn text-xs"
                              onClick={() => {
                                if (!confirm(`¿Quitar ${plate.name || "esta placa"}?`)) return;
                                setPlates({ ...plates, [printerId]: rows.filter((_, position) => position !== index) });
                                setPlateTab(Math.max(0, index - 1));
                              }}
                            >
                              Quitar {plate.name || "placa"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </fieldset>
      </div>

      <div className={part("costos")}>
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
                    onChange={(event) =>
                      setSupplies(supplies.map((item, position) => (position === index ? { ...item, material_id: event.target.value } : item)))
                    }
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
                <button
                  type="button"
                  className="btn"
                  aria-label="Quitar insumo"
                  onClick={() => setSupplies(supplies.filter((_, position) => position !== index))}
                >
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
          Posprocesado y otros costos por producto ($)
          <input className="input" type="number" min={0} step="any" value={extraCost} onChange={(event) => setExtraCost(event.target.value)} placeholder="0" />
          <span className="font-normal">Lijar, pintar, armar y lo que no llevas en Insumos (etiquetas, mano de obra…). El embalaje para envío va aparte.</span>
        </label>
      </div>
      <div className={part("general")}>
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
      </div>

      <div className={part("costos")}>
        <div className="flex flex-col gap-3 sm:col-span-2">
          {combos.missing.length > 0 && printerIds.length > 0 && (
            <p className="text-sm text-warn">Ninguna placa imprime todavía: {combos.missing.map((part) => part.name).join(", ")}.</p>
          )}
          {dearest && (
            <div className="grid gap-3 sm:grid-cols-2">
              <ComboCard
                title="Combinación más cara"
                hint="Cada pieza desde la placa donde sale más cara. Es el costo que usa el producto, para que tus precios siempre alcancen."
                combo={dearest}
              />
              {combos.cheapest && <ComboCard title="Combinación más barata" hint="Cada pieza desde la placa donde sale más barata." combo={combos.cheapest} />}
            </div>
          )}
          <div className="flex flex-col gap-1 rounded-lg bg-ink p-3">
            <Line label="Filamento" value={money(cost.filament)} />
            <Line label="Luz" value={money(cost.electricity)} />
            <Line label="Desgaste de máquina" value={money(cost.machine)} />
            {supplyCost > 0 && <Line label="Insumos" value={money(supplyCost)} />}
            <Line label="Posprocesado y otros" value={money(cost.extra - supplyCost)} />
            {share > 0 && <Line label="Gastos fijos (renta, internet…)" value={money(share)} />}
            <Line strong label="Costo por producto (combinación más cara)" value={money(cost.total)} />
            <p className="mt-1 text-xs text-muted">
              Luz = horas de impresión × consumo de la impresora (watts) × precio del kWh. Desgaste = horas × el desgaste por hora de la impresora (lo que costó
              ÷ su vida útil). Ambos por la parte de la placa que toca a cada pieza.
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
      </div>

      <div className={part("embalaje")}>
        {withSizes && (
          <BoxAdvisor draft={sizeDraft} onChange={setSizeDraft} packaging={packaging} chosen={packagingId} onPick={setPackagingId} hint={sizeHint} />
        )}

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
            {box &&
              (() => {
                // Shipping weight: the plastic of one product plus the empty package.
                const grams = draft.filaments.reduce((total, use) => total + use.grams, 0);
                return `${grams > 0 ? "" : " Importa el archivo del laminador para saber cuánto pesa la pieza."}${box.stock <= 0 ? " Ojo: no te quedan de este empaque." : ` Te quedan ${box.stock}.`}`;
              })()}
          </span>
        </label>
        {box && <ParcelFacts productGrams={draft.filaments.reduce((total, use) => total + use.grams, 0)} box={box} />}
      </div>

      <div className={part("precios")}>
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ownLevels} onChange={(event) => setOwnLevels(event.target.checked)} />
            Este producto tiene su propia ganancia
          </label>
          {ownLevels ? (
            <>
              <LevelsFields draft={levelsDraft} onChange={setLevelsDraft} base={workshopLevels} />
              {"error" in typedLevels && <p className="text-sm text-bad">{typedLevels.error}</p>}
            </>
          ) : (
            <p className="text-xs text-muted">
              Usa la de Ajustes: normal {workshopLevels.normal}%, descuento {workshopLevels.discount}%, mayoreo {workshopLevels.wholesale}% desde{" "}
              {workshopLevels.wholesale_min} piezas
              {workshopLevels.list_extra > 0 ? `, ${workshopLevels.list_extra}% extra para descontar` : ""} (sobre el costo).
            </p>
          )}
        </div>

        {channels.map((channel) => {
          const price = num(prices[channel.id] ?? "");
          const margin = levels.normal;
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
                  ? `Ganas ${money(unitProfit(price, cost.total, channel))} (${Math.round((unitProfit(price, cost.total, channel) / price) * 100)}% de la venta) sin envío · ${money(unitProfit(price, cost.total, channel, shipping))} con envío · es precio ${LEVEL_LABEL[levelOf(price, levelPrices(cost.total, channel, levels, shippingAt), levels)]}`
                  : `Sugerido con envío: ${money(suggestedShipped)}`}
              </span>
              <LevelPricesInfo cost={cost.total} channel={channel} levels={levels} shippingAt={shippingAt} />
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
              <input
                className="input mt-1"
                type="url"
                inputMode="url"
                value={links[channel.id] ?? ""}
                onChange={(event) => setLinks({ ...links, [channel.id]: event.target.value })}
                placeholder={`Enlace de tu publicación en ${channel.name} (opcional)`}
                aria-label={`Enlace de tu publicación en ${channel.name}`}
                maxLength={500}
              />
            </label>
          );
        })}
      </div>

      <div className={part("general")}>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={inCatalog} onChange={(event) => setInCatalog(event.target.checked)} />
          Mostrar en mi catálogo público (con sus fotos, descripción, categorías y los enlaces de arriba)
        </label>
      </div>

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

/** Shows or hides the product in the public catalog (Mi catálogo). */
function CatalogSwitch({ product }: { product: Product }) {
  const { busy, error, save } = useSave();
  const on = product.in_catalog ?? true;
  return (
    <span className="flex flex-col gap-1">
      <Switch
        checked={on}
        disabled={busy}
        label={on ? `Quitar ${product.name} del catálogo` : `Mostrar ${product.name} en el catálogo`}
        onChange={(value) => save(() => supabase().from("products").update({ in_catalog: value }).eq("id", product.id))}
      />
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
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
                <th className="num">Costo</th>
                {channels.map((channel) => (
                  <th key={channel.id} className="num">
                    {channel.name}
                  </th>
                ))}
                <th className="num">Stock</th>
                <th>Catálogo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((product) => {
                const breakdown = productCost(
                  product,
                  filaments,
                  printers,
                  profile?.kwh_price ?? 0,
                  materials,
                  profile?.waste_rules,
                  overheadPerPiece(profile),
                );
                const cost = breakdown.total;
                const photo = imageUrl(product.image_path);
                const grams = product.filaments.reduce((total, use) => total + use.grams, 0);
                const box = packaging.find((item) => item.id === product.packaging_id);
                const levels = priceLevels(profile, product);
                const margin = levels.normal;
                const tone = (profit: number) => (profit >= 0 ? "text-money" : "text-bad");
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
                    <td className="num whitespace-nowrap">
                      {money(cost)}
                      <InfoTip label={`Desglose del costo de ${product.name}`}>
                        <p className="font-semibold">Una pieza</p>
                        <TipLine label="Filamento (sin merma)" value={grams ? `${Math.round(grams * 10) / 10} g` : "—"} />
                        {product.filaments.length > 1 &&
                          product.filaments.map((use) => {
                            const filament = filaments.find((item) => item.id === use.filament_id);
                            return (
                              <TipLine
                                key={use.filament_id}
                                label={`· ${filament ? filament.color || filament.material : "Filamento"}`}
                                value={`${Math.round(use.grams * 10) / 10} g`}
                              />
                            );
                          })}
                        <TipLine label="Tiempo de impresión" value={duration(product.print_minutes)} />
                        <p className="mt-1 font-semibold">Costo</p>
                        <TipLine
                          label={profile?.waste_rules?.length && product.plates?.length ? "Filamento (con merma)" : "Filamento"}
                          value={money(breakdown.filament)}
                        />
                        <TipLine label="Luz" value={money(breakdown.electricity)} />
                        <TipLine label="Desgaste de máquina" value={money(breakdown.machine)} />
                        {(breakdown.supplies ?? 0) > 0 && <TipLine label="Insumos" value={money(breakdown.supplies ?? 0)} />}
                        {(breakdown.overhead ?? 0) > 0 && <TipLine label="Gastos fijos" value={money(breakdown.overhead ?? 0)} />}
                        {breakdown.extra > 0 && <TipLine label="Posprocesado y otros" value={money(breakdown.extra)} />}
                        <TipLine strong label="Costo por pieza" value={money(cost)} />
                      </InfoTip>
                    </td>
                    {channels.map((channel) => {
                      const price = product.prices[channel.id];
                      const shippingAt = (at: number) => shippingFor(channel, carriers, grams, box, at);
                      const suggestedPlain = suggestedPrice(cost, channel, margin);
                      const suggestedShipped = suggestedPriceWithShipping(cost, channel, margin, shippingAt);
                      const at = price || suggestedShipped;
                      const quotes = shippingQuotes(channel, carriers, grams, box, at);
                      // Without a price of their own, what selling at the suggested price (with shipping) would leave.
                      const estimated = unitProfit(suggestedShipped, cost, channel, shippingAt(suggestedShipped));
                      const tip = (
                        <InfoTip label={`Detalle en ${channel.name}`}>
                          <p className="font-semibold">{channel.name}</p>
                          {price ? <TipLine label="Tu precio" value={money(price)} /> : null}
                          <TipLine label="Sugerido sin envío" value={money(suggestedPlain)} />
                          <TipLine label="Sugerido con envío" value={money(suggestedShipped)} />
                          <p className="text-[11px] text-muted">
                            Con envío ganas los mismos pesos que sin envío: se suma el envío y lo que el canal cobra sobre él.
                          </p>
                          {(() => {
                            const atLevel = levelPrices(cost, channel, levels, shippingAt);
                            return (
                              <>
                                <p className="mt-1 font-semibold">
                                  Niveles con envío{Object.keys(product.price_levels ?? {}).length ? " (de este producto)" : ""}
                                </p>
                                {levels.list_extra > 0 && <TipLine label={`De lista (+${levels.list_extra}%)`} value={money(atLevel.list)} />}
                                <TipLine label={`Normal (${levels.normal}%)`} value={money(atLevel.normal)} />
                                <TipLine label={`Con descuento (${levels.discount}%)`} value={money(atLevel.discount)} />
                                <TipLine label={`Mayoreo ${levels.wholesale_min}+ (${levels.wholesale}%)`} value={money(atLevel.wholesale)} />
                              </>
                            );
                          })()}
                          <TipLine
                            label={`Comisión e impuestos${channel.reseller_share ? ` + revendedor ${channel.reseller_share}%` : ""} (${channelPct(channel).toFixed(1)}%)`}
                            value={`− ${money(channelFees(channel, at))}`}
                          />
                          {quotes.length > 0 ? (
                            <>
                              <TipLine label={`Envío más barato · ${quotes[0].carrier.name}`} value={money(quotes[0].cost)} />
                              {quotes.length > 1 && (
                                <TipLine label={`Envío más caro · ${quotes[quotes.length - 1].carrier.name}`} value={money(quotes[quotes.length - 1].cost)} />
                              )}
                              <TipLine label="Peso que cobra" value={`${quotes[quotes.length - 1].kg.toFixed(2)} kg`} />
                            </>
                          ) : (
                            <TipLine label="Envío del canal" value={money(channel.shipping_cost)} />
                          )}
                          {box && <TipLine label="Embalaje" value={money(box.cost)} />}
                          {price ? (
                            <>
                              <TipLine
                                strong
                                label={`Ganas sin envío (${Math.round((unitProfit(price, cost, channel) / price) * 100)}%)`}
                                value={money(unitProfit(price, cost, channel))}
                                tone={tone(unitProfit(price, cost, channel))}
                              />
                              <TipLine
                                label={`Ganas con envío (${Math.round((unitProfit(price, cost, channel, shippingAt(price)) / price) * 100)}%)`}
                                value={money(unitProfit(price, cost, channel, shippingAt(price)))}
                                tone={tone(unitProfit(price, cost, channel, shippingAt(price)))}
                              />
                            </>
                          ) : (
                            <>
                              <TipLine
                                strong
                                label={`Ganancia estimada al sugerido (${suggestedShipped > 0 ? Math.round((estimated / suggestedShipped) * 100) : 0}%)`}
                                value={money(estimated)}
                                tone={tone(estimated)}
                              />
                              <p className="mt-1 text-muted">Sin precio en este canal: pon uno en Editar.</p>
                            </>
                          )}
                        </InfoTip>
                      );
                      if (!price) {
                        return (
                          <td key={channel.id} className="num whitespace-nowrap text-sm text-muted">
                            <div>
                              sugerido {money(suggestedShipped)}
                              {tip}
                              {suggestedShipped > 0 && <div className={`text-xs ${tone(estimated)}`}>gana ~{money(estimated)} estimado</div>}
                            </div>
                          </td>
                        );
                      }
                      const shipped = unitProfit(price, cost, channel, shippingAt(price));
                      return (
                        <td key={channel.id} className="num whitespace-nowrap">
                          <div>
                            {money(price)}
                            {tip}
                            <div className={`text-xs ${tone(shipped)}`}>gana {money(shipped)} con envío</div>
                          </div>
                        </td>
                      );
                    })}
                    <td className={`num font-semibold ${product.stock <= 0 ? "text-bad" : ""}`}>{product.stock}</td>
                    <td>
                      <CatalogSwitch product={product} />
                    </td>
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
        <Modal wide="xl" title={editing === "new" ? "Nuevo producto" : editing.name} onClose={() => setEditing(null)}>
          <ProductForm product={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
