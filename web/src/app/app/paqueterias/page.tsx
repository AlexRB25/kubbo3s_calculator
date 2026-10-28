"use client";

import { useState, type FormEvent } from "react";
import { Empty, Modal, PageHeader, TableCard } from "@/components/app/ui";
import { useData, useSave } from "@/lib/data";
import { money, num } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Carrier } from "@/lib/types";

/**
 * Mercado Libre's rates for sellers with orange or red reputation, as the user showed them (prices in
 * $, up to $498.99; higher price columns are added by hand).
 */
const MERCADO_LIBRE = {
  name: "Mercado Libre (reputación naranja o roja)",
  divisor: 5000,
  prices: [98.99, 198.99, 298.99, 498.99],
  weights: [0.3, 0.5, 1, 2, 3, 4, 5, 7, 9, 12, 15, 20, 30, 40, 50, 60, 70, 80],
  rates: [
    [50, 64, 70, 104.8],
    [57, 68, 76, 112],
    [66, 76, 78, 119.2],
    [70, 80, 82, 135.2],
    [74, 92, 96, 152],
    [78, 100, 108, 164.8],
    [80, 106, 118, 176],
    [90, 118, 140, 196],
    [102, 134, 162, 223.2],
    [118, 156, 192, 258.4],
    [138, 184, 226, 304],
    [162, 216, 280, 356],
    [204, 274, 390, 450.4],
    [252, 340, 500, 558.4],
    [326, 440, 610, 722.4],
    [366, 494, 668, 811.2],
    [376, 508, 726, 832.8],
    [392, 528, 784, 867.2],
  ],
};

type Draft = { name: string; divisor: string; notes: string; prices: string[]; weights: string[]; rates: string[][] };

const toDraft = (carrier?: Pick<Carrier, "name" | "divisor" | "prices" | "weights" | "rates"> & { notes?: string }): Draft => ({
  name: carrier?.name ?? "",
  divisor: String(carrier?.divisor ?? 5000),
  notes: carrier?.notes ?? "",
  prices: (carrier?.prices ?? []).map(String),
  weights: (carrier?.weights ?? [1]).map(String),
  rates: (carrier?.weights ?? [1]).map((_, row) =>
    Array.from({ length: Math.max(carrier?.prices?.length ?? 0, 1) }, (__, column) => {
      const value = carrier?.rates?.[row]?.[column];
      return value === null || value === undefined ? "" : String(value);
    }),
  ),
});

/** Edits a carrier's rate table: rows by weight, columns by price (optional). */
function CarrierForm({ carrier, onDone }: { carrier?: Carrier; onDone: () => void }) {
  const { busy, error, setError, save } = useSave();
  const [draft, setDraft] = useState<Draft>(() => toDraft(carrier));
  const columns = Math.max(draft.prices.length, 1);
  const set = (change: Partial<Draft>) => setDraft({ ...draft, ...change });
  const setRate = (row: number, column: number, value: string) =>
    set({ rates: draft.rates.map((rates, r) => (r === row ? rates.map((cell, c) => (c === column ? value : cell)) : rates)) });

  function addColumn() {
    // The first column becomes a price column too ("hasta $…").
    const prices = draft.prices.length ? [...draft.prices, ""] : ["", ""];
    set({ prices, rates: draft.rates.map((rates) => (draft.prices.length ? [...rates, ""] : [...rates, ""])) });
  }
  function removeColumn(column: number) {
    const prices = draft.prices.filter((_, index) => index !== column);
    set({ prices: prices.length === 1 ? [] : prices, rates: draft.rates.map((rates) => rates.filter((_, index) => index !== column)) });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return setError("Ponle nombre a la paquetería.");
    const weights = draft.weights.map(num);
    if (weights.some((weight) => weight <= 0)) return setError("Cada renglón necesita su peso límite en kg.");
    if (weights.some((weight, index) => index > 0 && weight <= weights[index - 1])) return setError("Los pesos deben ir de menor a mayor.");
    const prices = draft.prices.map(num);
    if (prices.some((price, index) => price <= 0 || (index > 0 && price <= prices[index - 1]))) return setError("Los precios de las columnas deben ir de menor a mayor.");
    const row = {
      name: draft.name.trim(),
      divisor: num(draft.divisor) || 5000,
      notes: draft.notes.trim(),
      weights,
      prices,
      rates: draft.rates.map((rates) => rates.slice(0, columns).map((cell) => (cell.trim() === "" ? null : num(cell)))),
    };
    save(() => (carrier ? supabase().from("carriers").update(row).eq("id", carrier.id) : supabase().from("carriers").insert(row)), onDone);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          Nombre
          <input className="input" value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder="Mercado Libre, DHL, Estafeta…" maxLength={80} />
        </label>
        <label className="label">
          Divisor del peso volumétrico
          <input className="input" type="number" min={1} step="any" value={draft.divisor} onChange={(event) => set({ divisor: event.target.value })} />
          <span className="font-normal">Largo × ancho × alto (cm) ÷ esto. Mercado Libre y casi todas usan 5,000.</span>
        </label>
      </div>
      {!carrier && (
        <button type="button" className="btn self-start" onClick={() => setDraft(toDraft(MERCADO_LIBRE))}>
          Llenar con la tabla de Mercado Libre (reputación naranja o roja)
        </button>
      )}

      <div className="overflow-x-auto">
        <table className="table table-scroll w-max text-sm">
          <thead>
            <tr>
              <th>Peso hasta (kg)</th>
              {Array.from({ length: columns }, (_, column) => (
                <th key={column} className="num">
                  {draft.prices.length ? (
                    <span className="flex flex-col items-end gap-1">
                      <span>precio hasta $</span>
                      <span className="flex items-center gap-1">
                      <input
                        className="input px-2 py-1 text-right"
                        style={{ width: "7rem", minWidth: "7rem" }}
                        type="number"
                        min={0}
                        step="any"
                        value={draft.prices[column] ?? ""}
                        onChange={(event) => set({ prices: draft.prices.map((price, index) => (index === column ? event.target.value : price)) })}
                      />
                      <button type="button" className="btn px-2 py-1 text-xs" aria-label="Quitar columna" onClick={() => removeColumn(column)}>
                        ✕
                      </button>
                      </span>
                    </span>
                  ) : (
                    "Costo de envío ($)"
                  )}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.weights.map((weight, row) => (
              <tr key={row}>
                <td>
                  <input
                    className="input px-2 py-1"
                    style={{ width: "6rem", minWidth: "6rem" }}
                    type="number"
                    min={0}
                    step="any"
                    value={weight}
                    onChange={(event) => set({ weights: draft.weights.map((value, index) => (index === row ? event.target.value : value)) })}
                  />
                </td>
                {Array.from({ length: columns }, (_, column) => (
                  <td key={column} className="num">
                    <input
                      className="input px-2 py-1 text-right"
                        style={{ width: "7rem", minWidth: "7rem" }}
                      type="number"
                      min={0}
                      step="any"
                      value={draft.rates[row]?.[column] ?? ""}
                      onChange={(event) => setRate(row, column, event.target.value)}
                      placeholder="—"
                    />
                  </td>
                ))}
                <td>
                  {draft.weights.length > 1 && (
                    <button
                      type="button"
                      className="btn px-2 py-1 text-xs"
                      aria-label="Quitar renglón"
                      onClick={() => set({ weights: draft.weights.filter((_, index) => index !== row), rates: draft.rates.filter((_, index) => index !== row) })}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => set({ weights: [...draft.weights, ""], rates: [...draft.rates, Array.from({ length: columns }, () => "")] })}>
          + Renglón de peso
        </button>
        <button type="button" className="btn" onClick={addColumn}>
          + Columna por precio
        </button>
      </div>
      <p className="text-xs text-muted">
        Cada renglón es «hasta tantos kg». Si la paquetería cobra distinto según el precio del producto (como Mercado Libre), agrega columnas «precio hasta $…»;
        arriba de la última columna se usa la última. Se cobra por el peso mayor entre el físico (producto + empaque) y el volumétrico de la caja asignada al producto.
      </p>
      <label className="label">
        Notas
        <input className="input" value={draft.notes} onChange={(event) => set({ notes: event.target.value })} maxLength={300} />
      </label>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        {carrier && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Los canales que la usan dejarán de cotizar con ella. ¿Eliminar?")) save(() => supabase().from("carriers").delete().eq("id", carrier.id), onDone);
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}

/** Carriers with their rate tables; sales channels say which ones they ship with. */
export default function CarriersPage() {
  const { carriers, channels } = useData();
  const [editing, setEditing] = useState<Carrier | "new" | null>(null);

  return (
    <>
      <PageHeader title="Paqueterías">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nueva paquetería
        </button>
      </PageHeader>
      <p className="text-sm text-muted">
        Cada paquetería con su tabla de tarifas por peso (y por precio, si cobra así). En Canales de venta eliges con cuáles envía cada canal; cada producto te
        muestra el envío más caro y el más barato según el peso y la caja de su embalaje.
      </p>

      {carriers.length === 0 ? (
        <Empty>Agrega tus paqueterías con sus tarifas. Para Mercado Libre hay un botón que llena su tabla.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Paquetería</th>
                <th className="num">Hasta</th>
                <th className="num">Desde</th>
                <th>Canales</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {carriers.map((carrier) => {
                const all = carrier.rates.flat().filter((value): value is number => value !== null && value !== undefined);
                return (
                  <tr key={carrier.id}>
                    <td>
                      {carrier.name}
                      <span className="block text-xs text-muted">
                        {carrier.weights.length} pesos{carrier.prices.length ? ` × ${carrier.prices.length} rangos de precio` : ""} · divisor {Number(carrier.divisor)}
                      </span>
                    </td>
                    <td className="num">{carrier.weights.length ? `${Number(carrier.weights[carrier.weights.length - 1])} kg` : "—"}</td>
                    <td className="num">{all.length ? money(Math.min(...all)) : "—"}</td>
                    <td className="text-sm text-muted">
                      {channels
                        .filter((channel) => channel.carrier_ids?.includes(carrier.id))
                        .map((channel) => channel.name)
                        .join(", ") || "Ninguno"}
                    </td>
                    <td className="num">
                      <button className="btn" onClick={() => setEditing(carrier)}>
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
        <Modal wide title={editing === "new" ? "Nueva paquetería" : editing.name} onClose={() => setEditing(null)}>
          <CarrierForm carrier={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
