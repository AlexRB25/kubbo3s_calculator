"use client";

import { useEffect, useState } from "react";
import { fromMxn, loadRates } from "@/lib/currency";
import { useData, useSave } from "@/lib/data";
import { filamentColors } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { CatalogFilament } from "@/lib/types";
import { Swatch } from "./Swatch";

/**
 * The workshop's filament for a catalog one, with 0 g: stock comes later with purchases or an arqueo.
 * `costPerKg` is the catalog's reference already in the workshop's currency.
 */
export const catalogFilamentRow = (item: CatalogFilament, costPerKg: number) => ({
  material: item.material,
  brand: item.brand,
  color: item.color_name,
  color_hex: item.color_hex,
  extra_colors: item.extra_colors ?? [],
  glow: item.glow,
  image_url: item.image_url,
  catalog_id: item.id,
  cost_per_kg: Math.round(costPerKg * 100) / 100,
  low_stock_g: Math.round(Number(item.spool_g || 1000) * 0.2),
  notes: [item.nozzle_temp && `Boquilla ${item.nozzle_temp}`, item.bed_temp && `Cama ${item.bed_temp}`, item.notes].filter(Boolean).join(" · "),
  stock_g: 0,
});

/**
 * Brings several filaments of the Kubbo catalog at once: ticked ones, or every one still missing. The ones
 * already brought (same catalog_id) are never touched, so stock, prices and edits stay as they are; running it
 * again only adds what Kubbo added to the catalog since.
 */
export function FilamentCatalog({ onDone }: { onDone: () => void }) {
  const { filaments, profile } = useData();
  const { busy, error: saveError, save } = useSave();
  const [catalog, setCatalog] = useState<CatalogFilament[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [rates, setRates] = useState<Awaited<ReturnType<typeof loadRates>> | null>(null);
  const currency = profile?.currency ?? "MXN";

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
        if (failed) setError(`No se pudo leer el catálogo: ${failed.message}`);
        else setCatalog((data ?? []) as CatalogFilament[]);
      });
    loadRates().then((loaded) => current && setRates(loaded));
    return () => {
      current = false;
    };
  }, []);

  const added = new Set(filaments.map((item) => item.catalog_id).filter(Boolean));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (catalog ?? []).filter((item) => words.every((word) => `${item.brand} ${item.material} ${item.color_name}`.toLowerCase().includes(word)));
  const missing = shown.filter((item) => !added.has(item.id));
  const ticked = chosen.filter((id) => !added.has(id));
  const hasSome = (catalog ?? []).some((item) => added.has(item.id));
  const toggle = (id: string) => setChosen((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

  // The catalog's reference is in Mexican pesos.
  const local = (mxn: number) => (rates ? fromMxn(Number(mxn) || 0, currency, rates) : currency === "MXN" ? Number(mxn) || 0 : 0);

  function addMany(list: CatalogFilament[]) {
    const rows = list.filter((item) => !added.has(item.id)).map((item) => catalogFilamentRow(item, local(item.reference_price_kg)));
    if (!rows.length) return;
    const what = rows.length === 1 ? "1 filamento" : `${rows.length} filamentos`;
    if (!window.confirm(`¿Agregar ${what} con 0 g y su precio de referencia? Los que ya tienes no se tocan.`)) return;
    save(() => supabase().from("filaments").insert(rows), onDone);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Marca los que usas o agrégalos todos. Entran con 0 g: tu existencia la pones después con una compra o un arqueo. Si ya importaste antes, aquí solo se agregan
        los nuevos; lo que ya tienes (gramos, precio, notas) no se cambia ni se borra.
      </p>
      <input className="input" placeholder="Busca: elegoo gris, petg negro…" value={query} onChange={(event) => setQuery(event.target.value)} />
      {(error || saveError) && <p className="error">{error || saveError}</p>}
      {!catalog && !error && <p className="text-sm text-muted">Cargando catálogo…</p>}
      {catalog && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button className="btn btn-primary" disabled={busy || !ticked.length} onClick={() => addMany(catalog.filter((item) => chosen.includes(item.id)))}>
            {busy ? "Agregando…" : `Agregar seleccionados (${ticked.length})`}
          </button>
          <button className="btn" disabled={busy || !missing.length} onClick={() => addMany(missing)}>
            {!missing.length ? "Ya los tienes todos" : `${hasSome ? "Agregar los que me faltan" : "Agregar todos"}${words.length ? " de la búsqueda" : ""} (${missing.length})`}
          </button>
          {chosen.length > 0 && (
            <button className="text-muted hover:text-white" onClick={() => setChosen([])}>
              Quitar selección
            </button>
          )}
        </div>
      )}
      <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((item) => {
          const have = added.has(item.id);
          const on = !have && chosen.includes(item.id);
          return (
            <label
              key={item.id}
              className={`relative flex flex-col gap-2 rounded-lg border p-2 text-left ${have ? "cursor-default opacity-60" : "cursor-pointer hover:border-brand"} ${on ? "border-brand bg-brand/10" : "border-line"}`}
            >
              <input type="checkbox" className="absolute top-3 left-3 z-10 size-4 accent-brand" disabled={have} checked={on} onChange={() => toggle(item.id)} />
              <Swatch colors={filamentColors(item)} glow={item.glow} className="relative block aspect-square w-full overflow-hidden rounded-md">
                {item.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- public catalog photos
                  <img src={item.image_url} alt="" className="absolute inset-0 size-full object-cover" />
                )}
              </Swatch>
              <span className="text-sm font-semibold">
                {item.brand} {item.material}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <Swatch colors={filamentColors(item)} glow={item.glow} className="inline-block size-3 shrink-0 rounded-full border border-line" />
                {item.color_name}
              </span>
              {have && <span className="text-[10px] font-semibold text-brand">Ya lo tienes</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
