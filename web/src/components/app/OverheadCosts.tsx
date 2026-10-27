"use client";

import { useState, type FormEvent } from "react";
import { Switch } from "@/components/app/ui";
import { overheadPerPiece } from "@/lib/costs";
import { useData, useSave } from "@/lib/data";
import { money, num } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Overhead } from "@/lib/types";

type Row = { id: string; name: string; amount: string; active: boolean };

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/**
 * The workshop's fixed monthly costs (rent, internet, wages…). The active ones are divided among the
 * pieces made in a month and that share is added to the cost of every piece, so prices cover them.
 */
export function OverheadCosts() {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();
  const [pieces, setPieces] = useState(profile?.overhead_pieces ? String(profile.overhead_pieces) : "");
  const [rows, setRows] = useState<Row[]>(() =>
    (profile?.overheads ?? []).map((item) => ({ id: item.id, name: item.name, amount: String(item.amount), active: item.active })),
  );
  const [saved, setSaved] = useState(false);
  const set = (index: number, change: Partial<Row>) => {
    setSaved(false);
    setRows(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));
  };

  const draft = { overhead_pieces: Math.round(num(pieces)), overheads: rows.map((row) => ({ amount: num(row.amount), active: row.active })) };
  const monthly = draft.overheads.reduce((total, item) => total + (item.active ? item.amount : 0), 0);
  const share = overheadPerPiece(draft);

  function submit(event: FormEvent) {
    event.preventDefault();
    const overheads: Overhead[] = rows
      .filter((row) => row.name.trim() || num(row.amount) > 0)
      .map((row) => ({ id: row.id, name: row.name.trim(), amount: num(row.amount), active: row.active }));
    if (overheads.some((item) => !item.name)) return setError("Ponle nombre a cada gasto (Renta del local, Internet…).");
    if (overheads.some((item) => item.amount < 0)) return setError("Los montos no pueden ser negativos.");
    const count = Math.round(num(pieces));
    if (count < 0) return setError("Las piezas al mes no pueden ser negativas.");
    if (overheads.some((item) => item.active) && count <= 0) return setError("Escribe cuántas piezas produces al mes para repartir los gastos.");
    setSaved(false);
    save(
      () => supabase().from("profiles").update({ overheads, overhead_pieces: count }).eq("id", profile!.id),
      () => setSaved(true),
    );
  }

  return (
    <form onSubmit={submit} className="card flex max-w-2xl flex-col gap-3">
      <div>
        <h2>Gastos fijos del taller</h2>
        <p className="text-sm text-muted">
          Renta del local, internet, sueldos… Los que estén activos se reparten entre las piezas que produces al mes y esa parte se suma al costo de cada
          pieza (y por lo tanto al precio sugerido). Apágalos cuando no quieras cobrarlos.
        </p>
      </div>
      <label className="label">
        Piezas que produces al mes
        <span className="flex items-center gap-2 font-normal">
          <input
            className="input"
            style={{ width: "8rem" }}
            type="number"
            min={0}
            step={1}
            value={pieces}
            onChange={(event) => {
              setSaved(false);
              setPieces(event.target.value);
            }}
            placeholder="500"
          />
          piezas
        </span>
      </label>

      {rows.length === 0 && <p className="text-sm text-muted">Sin gastos fijos: el costo de las piezas es solo lo que lleva imprimirlas.</p>}
      {rows.map((row, index) => (
        <div key={row.id} className={`flex flex-wrap items-end gap-2 ${row.active ? "" : "opacity-60"}`}>
          <label className="label min-w-48 flex-1">
            Gasto
            <input className="input" value={row.name} onChange={(event) => set(index, { name: event.target.value })} maxLength={60} placeholder="Renta del local" />
          </label>
          <label className="label">
            Al mes ($)
            <input
              className="input"
              style={{ width: "9rem" }}
              type="number"
              min={0}
              step="any"
              value={row.amount}
              onChange={(event) => set(index, { amount: event.target.value })}
              placeholder="15000"
            />
          </label>
          <span className="mb-2 flex items-center gap-2 text-sm">
            <Switch checked={row.active} onChange={(active) => set(index, { active })} label={row.active ? `Desactivar ${row.name || "gasto"}` : `Activar ${row.name || "gasto"}`} />
            {row.active ? "Activo" : "Inactivo"}
          </span>
          <button
            type="button"
            className="btn mb-0.5"
            aria-label="Quitar gasto"
            onClick={() => {
              setSaved(false);
              setRows(rows.filter((_, position) => position !== index));
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn self-start"
        onClick={() => {
          setSaved(false);
          setRows([...rows, { id: newId(), name: "", amount: "", active: true }]);
        }}
      >
        + Agregar gasto
      </button>

      <p className="text-sm">
        {monthly > 0 && draft.overhead_pieces > 0
          ? `Activos: ${money(monthly)} al mes ÷ ${draft.overhead_pieces} piezas = ${money(share)} más por pieza.`
          : monthly > 0
            ? `Activos: ${money(monthly)} al mes. Escribe las piezas al mes para repartirlos.`
            : "Ningún gasto activo: no se suma nada al costo."}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-sm text-brand">Guardado: tus productos ya incluyen estos gastos.</p>}
      <button className="btn btn-primary self-start" disabled={busy}>
        {busy ? "Guardando…" : "Guardar gastos fijos"}
      </button>
    </form>
  );
}
