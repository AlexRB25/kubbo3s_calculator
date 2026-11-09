"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useData, useSave } from "@/lib/data";
import { field, money, num } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Channel, ChannelTax } from "@/lib/types";

/** Mexican VAT: a tax "on the price without VAT" applies to price ÷ 1.16. */
const VAT = 1.16;

/** The share of the price a tax takes. */
export const taxShare = (tax: Pick<ChannelTax, "pct" | "net">) => (tax.net ? tax.pct / VAT : tax.pct);

/** Usual withholdings, to add with one click. */
const PRESETS: ChannelTax[] = [
  { name: "IVA retenido", pct: 8, net: true },
  { name: "ISR retenido", pct: 2.5, net: true },
];

type TaxRow = { name: string; pct: string; net: boolean };

/**
 * A sales channel: commission, fixed fee, shipping, and its own list of taxes (as many as the user
 * wants, each with its %). They add up into tax_pct, which every price and profit already uses.
 */
export function ChannelForm({ channel, count, onDone }: { channel?: Channel; count: number; onDone: () => void }) {
  const { busy, error, setError, save } = useSave();
  const { carriers } = useData();
  const [carrierIds, setCarrierIds] = useState<string[]>(channel?.carrier_ids ?? []);
  const [name, setName] = useState(channel?.name ?? "");
  const [commission, setCommission] = useState(field(channel?.commission_pct));
  const [fixedFee, setFixedFee] = useState(field(channel?.fixed_fee));
  const [shipping, setShipping] = useState(field(channel?.shipping_cost));
  // Channels saved before the list had a single total: it becomes one row.
  const [taxes, setTaxes] = useState<TaxRow[]>(() =>
    channel?.taxes?.length
      ? channel.taxes.map((tax) => ({ name: tax.name, pct: String(tax.pct), net: Boolean(tax.net) }))
      : channel?.tax_pct
        ? [{ name: "Impuestos", pct: String(channel.tax_pct), net: false }]
        : [],
  );

  const saved: ChannelTax[] = taxes.filter((tax) => num(tax.pct) > 0).map((tax) => ({ name: tax.name.trim() || "Impuesto", pct: num(tax.pct), net: tax.net }));
  const total = Math.round(saved.reduce((sum, tax) => sum + taxShare(tax), 0) * 10000) / 10000;
  const setTax = (index: number, change: Partial<TaxRow>) => setTaxes(taxes.map((tax, position) => (position === index ? { ...tax, ...change } : tax)));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Ponle nombre al canal.");
    if (num(commission) + total >= 100) return setError("Comisión más impuestos deben sumar menos de 100%.");
    const row = {
      name: name.trim(),
      commission_pct: num(commission),
      tax_pct: total,
      taxes: saved,
      fixed_fee: num(fixedFee),
      shipping_cost: num(shipping),
      carrier_ids: carrierIds.filter((id) => carriers.some((carrier) => carrier.id === id)),
    };
    save(
      () => (channel ? supabase().from("channels").update(row).eq("id", channel.id) : supabase().from("channels").insert({ ...row, sort: count + 1 })),
      onDone,
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="label sm:col-span-2">
        Nombre
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Mercado Libre" maxLength={60} required />
      </label>
      <label className="label">
        Comisión (%)
        <input className="input" type="number" min={0} step="any" value={commission} onChange={(event) => setCommission(event.target.value)} placeholder="0" />
        <span className="font-normal">Porcentaje del precio que se queda la plataforma.</span>
      </label>
      <label className="label">
        Cargo fijo por pieza ($)
        <input className="input" type="number" min={0} step="any" value={fixedFee} onChange={(event) => setFixedFee(event.target.value)} placeholder="0" />
        <span className="font-normal">Por ejemplo, el costo fijo en publicaciones de precio bajo.</span>
      </label>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">Impuestos</legend>
        <p className="text-xs text-muted">
          Los que se van de cada venta en este canal: retenciones de la plataforma o los que pagas tú. Agrega los que quieras; se suman y se descuentan como la
          comisión.
        </p>
        {taxes.map((tax, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <label className="label min-w-36 flex-1">
              Nombre
              <input className="input" value={tax.name} onChange={(event) => setTax(index, { name: event.target.value })} placeholder="IVA retenido" maxLength={40} />
            </label>
            <label className="label w-24">
              %
              <input className="input" type="number" min={0} step="any" value={tax.pct} onChange={(event) => setTax(index, { pct: event.target.value })} placeholder="0" />
            </label>
            <label className="flex items-center gap-2 pb-3 text-sm">
              <input type="checkbox" checked={tax.net} onChange={(event) => setTax(index, { net: event.target.checked })} />
              sobre el precio sin IVA
            </label>
            <button type="button" className="btn mb-0.5" aria-label="Quitar impuesto" onClick={() => setTaxes(taxes.filter((_, position) => position !== index))}>
              ✕
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setTaxes([...taxes, { name: "", pct: "", net: false }])}>
            + Agregar impuesto
          </button>
          {PRESETS.filter((preset) => !taxes.some((tax) => tax.name === preset.name)).map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="btn"
              onClick={() => setTaxes([...taxes, { name: preset.name, pct: String(preset.pct), net: Boolean(preset.net) }])}
            >
              + {preset.name} {preset.pct}%
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <p className="text-sm">
            Total de impuestos: <strong>{total.toFixed(2)}% del precio</strong>
            <span className="text-muted"> · en una venta de $199 son {money((199 * total) / 100)}</span>
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">Paqueterías con las que envía</legend>
        {carriers.length ? (
          <>
            <div className="flex flex-wrap gap-3">
              {carriers.map((carrier) => (
                <label key={carrier.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={carrierIds.includes(carrier.id)}
                    onChange={(event) => setCarrierIds(event.target.checked ? [...carrierIds, carrier.id] : carrierIds.filter((id) => id !== carrier.id))}
                  />
                  {carrier.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">
              Cada producto cotiza con ellas según su peso y la caja de su embalaje: te muestra el envío más caro y el más barato, y su precio con envío usa el más
              caro.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            Agrega tus paqueterías y sus tarifas en{" "}
            <Link href="/app/paqueterias" className="text-brand hover:underline">
              Paqueterías
            </Link>
            .
          </p>
        )}
      </fieldset>

      <label className="label">
        {carrierIds.length ? "Envío fijo (si ninguna paquetería cotiza) ($)" : "Envío que pagas por venta ($)"}
        <input className="input" type="number" min={0} step="any" value={shipping} onChange={(event) => setShipping(event.target.value)} placeholder="0" />
        <span className="font-normal">{carrierIds.length ? "Se usa solo cuando ninguna paquetería tiene tarifa para ese peso." : "0 si lo paga el comprador."}</span>
      </label>

      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        {channel && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Las ventas ya registradas conservan el nombre del canal. ¿Eliminar?")) {
                save(() => supabase().from("channels").delete().eq("id", channel.id), onDone);
              }
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}
