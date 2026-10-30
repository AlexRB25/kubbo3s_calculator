"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useData, useSave } from "@/lib/data";
import { num } from "@/lib/format";
import { brandOptions } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { imageUrl, supabase, uploadProductImage } from "@/lib/supabase";
import type { CatalogFilament, Filament } from "@/lib/types";

const MATERIALS = ["PLA", "PLA+", "PLA Silk", "PLA Matte", "PETG", "Rapid PETG", "ABS", "ASA", "TPU", "Shoe3D", "PC", "Nylon"];

/** Picks a filament from the Kubbo catalog: search by brand, material or colour. */
function CatalogPicker({ onPick, onCancel }: { onPick: (filament: CatalogFilament) => void; onCancel: () => void }) {
  const [catalog, setCatalog] = useState<CatalogFilament[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    let current = true;
    supabase()
      .from("filament_catalog")
      .select("*")
      .order("brand")
      .order("material")
      .order("sort")
      .order("color_name")
      .then(({ data, error: failed }) => {
        if (!current) return;
        if (failed) setError(failed.message);
        else setCatalog((data ?? []) as CatalogFilament[]);
      });
    return () => {
      current = false;
    };
  }, []);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (catalog ?? []).filter((item) => {
    const text = `${item.brand} ${item.material} ${item.color_name}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Busca: elegoo gris, petg negro…" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
        <button type="button" className="btn" onClick={onCancel}>
          Escribirlo yo
        </button>
      </div>
      {error && <p className="error">No se pudo leer el catálogo: {error}</p>}
      {!catalog && !error && <p className="text-sm text-muted">Cargando catálogo…</p>}
      {catalog && shown.length === 0 && <p className="text-sm text-muted">{catalog.length ? "No hay filamentos con esa búsqueda." : "El catálogo todavía está vacío."}</p>}
      <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item)}
            className="flex flex-col gap-2 rounded-lg border border-line p-2 text-left hover:border-brand"
          >
            <span className="relative block aspect-square w-full overflow-hidden rounded-md" style={{ background: item.color_hex }}>
              {item.image_url && (
                // eslint-disable-next-line @next/next/no-img-element -- public catalog photos
                <img src={item.image_url} alt="" className="absolute inset-0 size-full object-cover" />
              )}
            </span>
            <span className="text-sm font-semibold">
              {item.brand} {item.material}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              <span className="inline-block size-3 rounded-full border border-line" style={{ background: item.color_hex }} />
              {item.color_name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A filament of the workshop: picked from the Kubbo catalog or written by hand, with the name of
 * its colour, its swatch and a photo. Stock is typed only when it is new; later it moves with
 * purchases, prints and arqueos.
 */
export function FilamentForm({ filament, onDone }: { filament?: Filament; onDone: () => void }) {
  const { suppliers, filaments, shop } = useData();
  const { session } = useSession();
  const { busy, error, setError, save } = useSave();
  const [picking, setPicking] = useState(!filament);
  const [catalogId, setCatalogId] = useState(filament?.catalog_id ?? null);
  const [material, setMaterial] = useState(filament?.material ?? "PLA");
  const [brand, setBrand] = useState(filament?.brand ?? "");
  const [color, setColor] = useState(filament?.color ?? "");
  const [colorHex, setColorHex] = useState(filament?.color_hex ?? "#ffffff");
  const [photo, setPhoto] = useState<string | null>(filament?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [stock, setStock] = useState("");
  const [costPerKg, setCostPerKg] = useState(filament ? String(filament.cost_per_kg) : "");
  const [lowStock, setLowStock] = useState(String(filament?.low_stock_g ?? 200));
  const [supplierId, setSupplierId] = useState(filament?.supplier_id ?? "");
  const [notes, setNotes] = useState(filament?.notes ?? "");

  function pick(item: CatalogFilament) {
    setCatalogId(item.id);
    setMaterial(item.material);
    setBrand(item.brand);
    setColor(item.color_name);
    setColorHex(item.color_hex);
    setPhoto(item.image_url);
    if (item.reference_price_kg > 0) setCostPerKg(String(item.reference_price_kg));
    setLowStock(String(Math.round(item.spool_g * 0.2)));
    setNotes([item.nozzle_temp && `Boquilla ${item.nozzle_temp}`, item.bed_temp && `Cama ${item.bed_temp}`, item.notes].filter(Boolean).join(" · "));
    setPicking(false);
  }

  async function upload(file: File | undefined) {
    if (!file || !session) return;
    setUploading(true);
    const { path, error: failed } = await uploadProductImage(shop?.shop_id ?? session.user.id, file);
    setUploading(false);
    if (failed) return setError(`No se pudo subir la foto: ${failed.message}`);
    setPhoto(imageUrl(path));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!material.trim()) return setError("Indica el material.");
    if (!color.trim()) return setError("Escribe el nombre del color (por ejemplo «Verde bosque»): así lo distingues en las listas.");
    const row = {
      material: material.trim(),
      brand: brand.trim(),
      color: color.trim(),
      color_hex: colorHex,
      image_url: photo,
      catalog_id: catalogId,
      cost_per_kg: num(costPerKg),
      low_stock_g: num(lowStock),
      supplier_id: supplierId || null,
      notes: notes.trim(),
      // Stock is only typed for a new filament: it goes into the history as the initial stock.
      ...(filament ? {} : { stock_g: num(stock) }),
    };
    save(() => (filament ? supabase().from("filaments").update(row).eq("id", filament.id) : supabase().from("filaments").insert(row)), onDone);
  }

  if (picking) return <CatalogPicker onPick={pick} onCancel={() => setPicking(false)} />;

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-center gap-3 sm:col-span-2">
        <span className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-line" style={{ background: colorHex }}>
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- public photo of the spool
            <img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
          )}
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{[material, color, brand].filter(Boolean).join(" ") || "Filamento"}</p>
          {catalogId && <p className="text-xs text-brand">Del catálogo Kubbo</p>}
          <div className="flex flex-wrap gap-2">
            <label className="btn cursor-pointer px-3 py-1 text-xs">
              {uploading ? "Subiendo…" : photo ? "Cambiar foto" : "Subir foto"}
              <input type="file" accept="image/*" className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
            </label>
            {photo && (
              <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setPhoto(null)}>
                Quitar foto
              </button>
            )}
            <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setPicking(true)}>
              Elegir del catálogo
            </button>
          </div>
        </div>
      </div>

      <label className="label">
        Material
        <input className="input" value={material} onChange={(event) => setMaterial(event.target.value)} list="filament-materials" required />
        <datalist id="filament-materials">
          {MATERIALS.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </label>
      <label className="label">
        Marca
        <input
          className="input"
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          list="filament-brands"
          maxLength={40}
          placeholder="Elige de la lista o escribe otra"
        />
        <datalist id="filament-brands">
          {brandOptions(filaments.map((item) => item.brand)).map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </label>
      <label className="label">
        Nombre del color
        <input className="input" value={color} onChange={(event) => setColor(event.target.value)} placeholder="Verde bosque, Gris espacial…" required />
      </label>
      <label className="label">
        Color
        <span className="flex items-center gap-2">
          <input className="input h-11 w-16 p-1" type="color" value={colorHex} onChange={(event) => setColorHex(event.target.value)} />
          <span className="rounded-full border border-line px-3 py-1 text-xs" style={{ background: colorHex, color: luminance(colorHex) > 0.6 ? "#101315" : "#ffffff" }}>
            {color || "Así se verá en las listas"}
          </span>
        </span>
      </label>
      {!filament && (
        <label className="label">
          Existencia inicial (g)
          <input className="input" inputMode="decimal" value={stock} onChange={(event) => setStock(event.target.value)} placeholder="0" />
          <span className="font-normal">Lo que ya tienes; queda en el historial. Después suben las compras y bajan las impresiones.</span>
        </label>
      )}
      <label className="label">
        Costo de referencia por kg ($)
        <input className="input" inputMode="decimal" value={costPerKg} onChange={(event) => setCostPerKg(event.target.value)} placeholder="0" />
        <span className="font-normal">Lo que normalmente cuesta. El costo real por gramo sale de tus compras.</span>
      </label>
      <label className="label">
        Avisarme al bajar de (g)
        <input className="input" inputMode="decimal" value={lowStock} onChange={(event) => setLowStock(event.target.value)} />
      </label>
      <label className="label">
        Proveedor
        <select className="input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
          <option value="">Sin proveedor</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </label>
      <label className="label sm:col-span-2">
        Notas
        <textarea className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Temperaturas, secado…" />
      </label>
      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy || uploading}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        {filament && (
          <button
            type="button"
            className="btn text-bad"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("El historial se conserva, pero los productos que usan este filamento dejarán de sumar su costo. ¿Eliminar?")) return;
              save(() => supabase().from("filaments").delete().eq("id", filament.id), onDone);
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}

/** 0 (black) … 1 (white), to pick a readable text colour over a swatch. */
function luminance(hex: string) {
  const value = parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  return (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
}
