"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSave } from "@/lib/data";
import { day, isoDay, money, num } from "@/lib/format";
import { amount, UNIT_LABELS, type Item } from "@/lib/inventory";
import { supabase } from "@/lib/supabase";
import type { InventoryMove } from "@/lib/types";

export const MOVE_LABELS: Record<InventoryMove["kind"], string> = {
  purchase: "Compra",
  print: "Impresión",
  production: "Producción",
  sale: "Venta",
  adjustment: "Arqueo",
};

const REASONS = ["Merma", "Impresión fallida", "Conteo físico", "Muestra o regalo", "Se dañó"];

/**
 * Arqueo: the user types what there physically is and the difference goes in or out, with its
 * reason, as a movement of the history. It is not a purchase nor an expense.
 */
export function CountForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const { busy, error, setError, save } = useSave();
  const [counted, setCounted] = useState(String(Math.max(0, Math.round(item.stock * 1000) / 1000)));
  const [note, setNote] = useState("");
  const [date, setDate] = useState(isoDay());
  const delta = num(counted) - item.stock;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (num(counted) < 0) return setError("Lo que hay físicamente no puede ser negativo.");
    if (item.type === "product" && !Number.isInteger(num(counted))) return setError("Los productos se cuentan en piezas enteras.");
    if (Math.abs(delta) < 1e-6) return setError("Lo que hay es igual a lo registrado: no hay nada que arquear.");
    if (!note.trim()) return setError("Escribe el motivo (merma, impresión fallida, conteo…) para que quede en el historial.");
    save(() => supabase().from("inventory_adjustments").insert({ item_type: item.type, item_id: item.id, delta, note: note.trim(), moved_at: date }), onDone);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm">
        El sistema dice que tienes <strong>{amount(item, item.stock)}</strong>.
      </p>
      <label className="label">
        Lo que tienes físicamente ({UNIT_LABELS[item.unit]})
        <input className="input" inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} required autoFocus />
      </label>
      {Math.abs(delta) > 1e-6 && (
        <p className={`rounded-lg border border-line p-3 text-sm ${delta < 0 ? "text-bad" : "text-money"}`}>
          {delta < 0 ? "Se restan" : "Se suman"} {amount(item, Math.abs(delta))}
          {item.unitCost > 0 && ` (${money(Math.abs(delta) * item.unitCost)} a costo)`} y quedan {amount(item, num(counted))}.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <span className="label">Motivo</span>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((reason) => (
            <button key={reason} type="button" className={`btn px-3 py-1 text-xs ${note === reason ? "border-brand text-brand" : ""}`} onClick={() => setNote(reason)}>
              {reason}
            </button>
          ))}
        </div>
        <input className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="O escribe otro motivo" />
      </div>
      <label className="label">
        Fecha
        <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar arqueo"}
        </button>
        <span className="text-xs text-muted">No es una compra ni un gasto: queda en el historial de movimientos.</span>
      </div>
    </form>
  );
}

/** Every movement of one item: purchases, prints, production, sales and arqueos. */
export function StockHistory({ item }: { item: Item }) {
  const [moves, setMoves] = useState<InventoryMove[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    supabase()
      .from("inventory_moves")
      .select("*")
      .eq("item_type", item.type)
      .eq("item_id", item.id)
      .order("moved_at", { ascending: false })
      .limit(300)
      .then(({ data, error: failed }) => {
        if (!current) return;
        if (failed) setError(failed.message);
        else setMoves((data ?? []) as InventoryMove[]);
      });
    return () => {
      current = false;
    };
  }, [item.type, item.id]);

  if (error) return <p className="error">No se pudo leer el historial: {error}</p>;
  if (!moves) return <p className="text-muted">Cargando…</p>;
  if (!moves.length) return <p className="text-muted">Todavía no hay movimientos.</p>;
  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Movimiento</th>
            <th className="num">Cantidad</th>
            <th className="num">Importe</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((move) => (
            <tr key={`${move.kind}-${move.id}`}>
              <td className="whitespace-nowrap text-muted">{day(move.moved_at)}</td>
              <td>{MOVE_LABELS[move.kind]}</td>
              <td className={`num font-semibold ${move.quantity < 0 ? "text-bad" : "text-money"}`}>
                {move.quantity > 0 ? "+" : "−"}
                {amount(item, Math.abs(move.quantity))}
              </td>
              <td className="num">{move.total == null ? "—" : money(move.total)}</td>
              <td className="text-muted">{move.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
