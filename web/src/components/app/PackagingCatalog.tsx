"use client";

import { useEffect, useState } from "react";
import { BoxPreview } from "@/components/app/BoxPreview";
import { BOX_COLORS, boxFaces } from "@/lib/box3d";
import { fromMxn, loadRates } from "@/lib/currency";
import { useData, useSave } from "@/lib/data";
import { getWorkshopCurrency, money, num } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { CatalogPackaging } from "@/lib/types";

const GROUPS = [
  { value: "all", label: "Todas" },
  { value: "envio", label: "Cajas de envío" },
  { value: "maletin", label: "Tipo maletín" },
  { value: "plana", label: "Planas (pizza, cuadro)" },
] as const;
type Group = (typeof GROUPS)[number]["value"];

/** Which tab a box falls in: flat ones (pizza, frames) are those much lower than they are wide. */
function groupOf(item: CatalogPackaging): Group {
  if (item.style === "mailer" && Number(item.height_mm) * 5 <= Math.min(Number(item.length_mm), Number(item.width_mm))) return "plana";
  return item.style === "mailer" ? "maletin" : "envio";
}

const cm = (mm: number) => `${Math.round(Number(mm)) / 10}`.replace(/\.0$/, "");
const measures = (item: Pick<CatalogPackaging, "length_mm" | "width_mm" | "height_mm">) =>
  `${cm(item.length_mm)}×${cm(item.width_mm)}×${cm(item.height_mm)} cm`;

/** The row of the workshop's packaging for a catalog box, at the given cost. */
const packagingRow = (item: CatalogPackaging, cost: number, name = item.name, stock = 0) => ({
  name: name.trim() || item.name,
  kind: item.kind,
  length_mm: item.length_mm,
  width_mm: item.width_mm,
  height_mm: item.height_mm,
  cost: Math.round(cost * 100) / 100,
  stock,
  weight_g: item.weight_g,
  notes: item.notes,
  catalog_id: item.id,
  style: item.style,
  material: item.material,
});

/** One still frame of the box, for the list. */
function BoxThumb({ item }: { item: CatalogPackaging }) {
  const colors = BOX_COLORS[item.material] ?? BOX_COLORS.kraft;
  const faces = boxFaces({ length: Number(item.length_mm), width: Number(item.width_mm), height: Number(item.height_mm) }, item.style, 0.6, 0.35, 96, colors);
  return (
    <svg width={96} height={96} viewBox="0 0 96 96" aria-hidden>
      {faces.map((face, index) => (
        <polygon key={index} points={face.points} fill={face.fill} stroke={colors.edge} strokeWidth={0.8} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** Boxes Kubbo3D keeps ready: pick one, see it in 3D, and add it to your packaging at the price you pay. */
export function PackagingCatalog({ onDone }: { onDone: () => void }) {
  const { packaging } = useData();
  const [catalog, setCatalog] = useState<CatalogPackaging[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<Group>("all");
  const [picked, setPicked] = useState<CatalogPackaging | null>(null);
  const [rates, setRates] = useState<Awaited<ReturnType<typeof loadRates>> | null>(null);
  // Boxes ticked to add several at once.
  const [chosen, setChosen] = useState<string[]>([]);
  const { busy, error: saveError, save } = useSave();
  const currency = getWorkshopCurrency();

  useEffect(() => {
    let current = true;
    supabase()
      .from("packaging_catalog")
      .select("*")
      .order("sort")
      .then(({ data, error: failed }) => {
        if (!current) return;
        if (failed) setError(failed.code === "42P01" ? "Falta actualizar la base de datos (supabase/schema.sql) para ver el catálogo." : failed.message);
        else setCatalog((data ?? []) as CatalogPackaging[]);
      });
    loadRates().then((loaded) => current && setRates(loaded));
    return () => {
      current = false;
    };
  }, []);

  // Reference prices are in Mexican pesos; shown in the workshop's currency.
  const local = (mxn: number | null) => (mxn === null ? null : rates ? fromMxn(Number(mxn), currency, rates) : currency === "MXN" ? Number(mxn) : null);

  const needle = query.trim().toLowerCase();
  const shown = (catalog ?? []).filter(
    (item) => (group === "all" || groupOf(item) === group) && (!needle || `${item.name} ${measures(item)} ${item.notes}`.toLowerCase().includes(needle)),
  );
  const added = new Set(packaging.map((item) => item.catalog_id).filter(Boolean));
  const missing = shown.filter((item) => !added.has(item.id));
  const toggle = (id: string) => setChosen((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));

  /** Adds several boxes at their reference price per piece (0 when there is none), skipping the ones already added. */
  function addMany(list: CatalogPackaging[]) {
    const rows = list.filter((item) => !added.has(item.id)).map((item) => packagingRow(item, local(item.price_mxn) ?? 0));
    if (!rows.length) return;
    if (
      !window.confirm(
        `¿Agregar ${rows.length} ${rows.length === 1 ? "caja" : "cajas"} a tu embalaje con su precio de referencia por pieza? Luego puedes cambiar el precio y las piezas de cada una.`,
      )
    )
      return;
    save(() => supabase().from("packaging").insert(rows), onDone);
  }

  if (picked)
    return (
      <CatalogBox item={picked} price={local(picked.price_mxn)} wholesale={local(picked.wholesale_price_mxn)} onBack={() => setPicked(null)} onDone={onDone} />
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Cajas con medidas y precios de referencia de tiendas de empaque. Elige una, revísala en 3D y agrégala a tu embalaje con el precio que tú pagas.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs flex-1"
          placeholder="Buscar: 20×20, pizza, maletín…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {GROUPS.map((item) => (
          <button key={item.value} className={`btn ${group === item.value ? "btn-on" : ""}`} onClick={() => setGroup(item.value)}>
            {item.label}
          </button>
        ))}
      </div>
      {(error || saveError) && <p className="error">{error || saveError}</p>}
      {catalog && missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            className="btn btn-primary"
            disabled={busy || !chosen.some((id) => !added.has(id))}
            onClick={() => addMany((catalog ?? []).filter((item) => chosen.includes(item.id)))}
          >
            {busy ? "Agregando…" : `Agregar seleccionadas (${chosen.filter((id) => !added.has(id)).length})`}
          </button>
          <button className="btn" disabled={busy} onClick={() => addMany(missing)}>
            {`${added.size ? "Agregar las que me faltan" : "Agregar todas"}${group === "all" && !needle ? "" : " de lo que se ve"} (${missing.length})`}
          </button>
          {chosen.length > 0 && (
            <button className="text-muted hover:text-white" onClick={() => setChosen([])}>
              Quitar selección
            </button>
          )}
          <span className="text-xs text-muted">Marca la casilla de cada caja para elegir varias. Las que ya tienes no se tocan (ni precio ni piezas).</span>
        </div>
      )}
      {!catalog && !error && <p className="text-muted">Cargando el catálogo…</p>}
      <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((item) => {
          const price = local(item.price_mxn);
          const wholesale = local(item.wholesale_price_mxn);
          const have = added.has(item.id);
          const ticked = chosen.includes(item.id);
          return (
            <div key={item.id} className="relative">
              <input
                type="checkbox"
                aria-label={`Elegir ${item.name}`}
                title={have ? "Ya la tienes" : "Elegir para agregar varias"}
                className="absolute top-2 left-2 z-10 size-4 cursor-pointer accent-brand disabled:cursor-not-allowed"
                disabled={have}
                checked={ticked && !have}
                onChange={() => toggle(item.id)}
              />
              <button
                className={`flex w-full flex-col items-center gap-1 rounded-xl border p-2 text-center transition hover:border-brand/60 hover:bg-raised/50 ${ticked && !have ? "border-brand bg-brand/10" : "border-line"}`}
                onClick={() => setPicked(item)}
              >
                <BoxThumb item={item} />
                <span className="text-sm leading-tight font-semibold">{item.name}</span>
                <span className="text-xs text-muted">{measures(item)}</span>
                <span className="text-xs">
                  {price !== null ? money(price) : <span className="text-muted">Sin precio</span>}
                  {wholesale !== null && <span className="text-money"> · {money(wholesale)} mayoreo</span>}
                </span>
                {have && <span className="text-[10px] font-semibold text-brand">Ya la tienes</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CatalogBox({
  item,
  price,
  wholesale,
  onBack,
  onDone,
}: {
  item: CatalogPackaging;
  price: number | null;
  wholesale: number | null;
  onBack: () => void;
  onDone: () => void;
}) {
  const { busy, error, save } = useSave();
  const [which, setWhich] = useState<"piece" | "wholesale" | "own">(price !== null ? "piece" : "own");
  const [own, setOwn] = useState("");
  const [name, setName] = useState(item.name);
  const [stock, setStock] = useState("");
  const cost = which === "piece" ? (price ?? 0) : which === "wholesale" ? (wholesale ?? 0) : num(own);

  function add() {
    save(
      () =>
        supabase()
          .from("packaging")
          .insert(packagingRow(item, cost, name, Math.round(num(stock)))),
      onDone,
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <BoxPreview length_mm={item.length_mm} width_mm={item.width_mm} height_mm={item.height_mm} style={item.style} material={item.material} size={260} />
      <div className="flex flex-col gap-4">
        <button className="self-start text-sm text-muted hover:text-white" onClick={onBack}>
          ← Volver al catálogo
        </button>
        <label className="label">
          Nombre en tu embalaje
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {item.notes && <p className="text-sm text-muted">{item.notes}</p>}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">¿Cuánto te cuesta cada una?</span>
          {price !== null && (
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={which === "piece"} onChange={() => setWhich("piece")} />
              Por pieza: <strong>{money(price)}</strong>
            </label>
          )}
          {wholesale !== null && (
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={which === "wholesale"} onChange={() => setWhich("wholesale")} />
              Mayoreo: <strong className="text-money">{money(wholesale)}</strong>
              {item.wholesale_min ? <span className="text-muted">desde {item.wholesale_min} piezas</span> : null}
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={which === "own"} onChange={() => setWhich("own")} />
            Otro precio
            {which === "own" && (
              <input className="input w-28" inputMode="decimal" autoFocus value={own} placeholder="0" onChange={(event) => setOwn(event.target.value)} />
            )}
          </label>
          {price === null && <p className="text-xs text-muted">No tenemos su precio; escribe lo que te cuesta en tu tienda.</p>}
          <p className="text-xs text-muted">Precios de referencia de una tienda de empaques; pueden variar en la tuya.</p>
        </div>
        <label className="label max-w-40">
          Piezas que tienes
          <input className="input" inputMode="numeric" value={stock} placeholder="0" onChange={(event) => setStock(event.target.value)} />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="btn btn-primary self-start" disabled={busy} onClick={add}>
          {busy ? "Agregando…" : `Agregar a mi embalaje · ${money(cost)}`}
        </button>
      </div>
    </div>
  );
}
