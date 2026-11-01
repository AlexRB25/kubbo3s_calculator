"use client";

import { useState, type FormEvent } from "react";
import { DEFAULT_PRICE_LEVELS, levelPrices, priceLevels, unitProfit, type PriceLevels } from "@/lib/costs";
import { useData, useSave } from "@/lib/data";
import { money, num } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/types";

export type LevelsDraft = Record<keyof PriceLevels, string>;

const KEYS: (keyof PriceLevels)[] = ["normal", "discount", "wholesale", "wholesale_min", "list_extra"];

export const draftOf = (levels: PriceLevels): LevelsDraft => Object.fromEntries(KEYS.map((key) => [key, String(levels[key])])) as LevelsDraft;

/** The typed levels, or the reason they cannot be saved. */
export function readLevels(draft: LevelsDraft): { levels: PriceLevels } | { error: string } {
  const levels = Object.fromEntries(KEYS.map((key) => [key, num(draft[key])])) as PriceLevels;
  levels.wholesale_min = Math.round(levels.wholesale_min);
  if ([levels.normal, levels.discount, levels.wholesale].some((pct) => !(pct >= 0 && pct <= 1000))) return { error: "Cada ganancia va de 0% a 1000% del costo." };
  if (levels.discount > levels.normal) return { error: "La ganancia con descuento no puede ser mayor que la normal." };
  if (levels.wholesale > levels.discount) return { error: "La ganancia de mayoreo no puede ser mayor que la de descuento." };
  if (levels.wholesale_min < 2) return { error: "El mayoreo empieza desde 2 piezas o más." };
  if (!(levels.list_extra >= 0 && levels.list_extra <= 300)) return { error: "El margen extra va de 0% a 300%." };
  return { levels };
}

/** The five boxes of the levels; `base` shows the workshop's value under each one (in a product). */
export function LevelsFields({ draft, onChange, base }: { draft: LevelsDraft; onChange: (draft: LevelsDraft) => void; base?: PriceLevels }) {
  const box = (key: keyof PriceLevels, label: string, unit: string, hint: string) => (
    <label className="label">
      {label}
      <span className="flex items-center gap-2 font-normal">
        <input className="input" style={{ width: "6rem" }} type="number" min={0} step="any" value={draft[key]} onChange={(event) => onChange({ ...draft, [key]: event.target.value })} />
        {unit}
      </span>
      <span className="font-normal">{base && num(draft[key]) !== base[key] ? `El del taller: ${base[key]} ${unit}` : hint}</span>
    </label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {box("normal", "Ganancia normal", "%", "Tu precio de siempre.")}
      {box("discount", "Con descuento", "%", "Lo más que bajas en una oferta.")}
      {box("wholesale", "Mayoreo", "%", "Lo más que bajas por volumen.")}
      {box("wholesale_min", "Mayoreo desde", "piezas", "Desde cuántas piezas aplica.")}
      {box("list_extra", "Margen extra para descontar", "%", "Se suma al normal para publicar. 0 = sin extra.")}
    </div>
  );
}

/** A piece that costs 100, without commission: what each level charges, leaves and is of the sale. */
export function LevelsExample({ levels }: { levels: PriceLevels }) {
  const cost = 100;
  const plain = { commission_pct: 0, tax_pct: 0, fixed_fee: 0, shipping_cost: 0 } as Channel;
  const prices = levelPrices(cost, plain, levels);
  const rows: [string, number][] = [
    ...(levels.list_extra > 0 ? ([[`De lista (+${levels.list_extra}%)`, prices.list]] as [string, number][]) : []),
    [`Normal (${levels.normal}%)`, prices.normal],
    [`Con descuento (${levels.discount}%)`, prices.discount],
    [`Mayoreo, ${levels.wholesale_min}+ piezas (${levels.wholesale}%)`, prices.wholesale],
  ];
  return (
    <div className="rounded-lg bg-ink p-3 text-sm">
      <p className="mb-2 text-muted">Ejemplo: una pieza que te cuesta {money(cost)} hacer, en un canal sin comisión.</p>
      <table className="w-full">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="font-normal">Nivel</th>
            <th className="num font-normal">Precio</th>
            <th className="num font-normal">Te quedan</th>
            <th className="num font-normal">De la venta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, price]) => {
            const profit = unitProfit(price, cost, plain);
            return (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{money(price)}</td>
                <td className="num text-money">{money(profit)}</td>
                <td className="num">{price > 0 ? Math.round((profit / price) * 100) : 0}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        La ganancia se mide sobre el costo; la columna «De la venta» te dice cuánto es del precio. En cada producto verás estos precios ya con la comisión y el envío
        de cada canal: no tienes que calcular nada.
      </p>
    </div>
  );
}

/** The old single margin (% of the price) older app versions still read, kept in step with the normal level. */
export const marginOnPrice = (normal: number) => Math.min(94, Math.round(((normal * 100) / (100 + normal)) * 100) / 100);

/** Settings card: how much the workshop earns at each level. */
export function PriceLevelsSettings() {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();
  const [draft, setDraft] = useState(() => draftOf(priceLevels(profile)));
  const [saved, setSaved] = useState(false);
  const read = readLevels(draft);

  function submit(event: FormEvent) {
    event.preventDefault();
    if ("error" in read) return setError(read.error);
    setSaved(false);
    save(
      () => supabase().from("profiles").update({ price_levels: read.levels, margin_pct: marginOnPrice(read.levels.normal) }).eq("id", profile!.id),
      () => setSaved(true),
    );
  }

  return (
    <form onSubmit={submit} className="card flex max-w-2xl flex-col gap-3">
      <div>
        <h2>Ganancia por nivel de precio</h2>
        <p className="text-sm text-muted">
          Cuánto quieres ganar sobre lo que te cuesta hacer la pieza: 100% = ganas lo mismo que te cuesta. Con descuento y mayoreo son tu límite: hasta ahí puedes bajar.
          Valen para todos tus productos; uno en particular puede tener los suyos en Productos → Editar.
        </p>
      </div>
      <LevelsFields draft={draft} onChange={setDraft} />
      <LevelsExample levels={"levels" in read ? read.levels : DEFAULT_PRICE_LEVELS} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-sm text-brand">Guardado: tus precios sugeridos ya usan estos niveles.</p>}
      <button className="btn btn-primary self-start" disabled={busy}>
        {busy ? "Guardando…" : "Guardar niveles"}
      </button>
    </form>
  );
}

/**
 * The price of each level in one channel (with shipping when `shippingAt` is given), what it leaves and
 * what share of the sale it is — under a product's price, so the user knows how far down to go.
 */
export function LevelPricesInfo({ cost, channel, levels, shippingAt }: { cost: number; channel: Channel; levels: PriceLevels; shippingAt?: (price: number) => number }) {
  const prices = levelPrices(cost, channel, levels, shippingAt);
  const rows: [string, number][] = [
    ...(levels.list_extra > 0 ? ([["De lista", prices.list]] as [string, number][]) : []),
    ["Normal", prices.normal],
    ["Descuento", prices.discount],
    [`Mayoreo ${levels.wholesale_min}+`, prices.wholesale],
  ];
  if (prices.normal <= 0) return null;
  return (
    <span className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg bg-ink px-2 py-1.5 text-xs font-normal sm:grid-cols-4">
      {rows.map(([label, price]) => {
        const profit = unitProfit(price, cost, channel, shippingAt ? shippingAt(price) : 0);
        return (
          <span key={label} className="flex flex-col">
            <span className="text-muted">{label}</span>
            <span className="font-semibold">{money(price)}</span>
            <span className="text-money">
              +{money(profit)} · {Math.round((profit / price) * 100)}%
            </span>
          </span>
        );
      })}
    </span>
  );
}
