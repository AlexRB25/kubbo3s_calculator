"use client";

import { useState, type FormEvent } from "react";
import { useData, useSave } from "@/lib/data";
import { num } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { WasteRule } from "@/lib/types";

/** A common rule: the more pieces on a plate, the more of it can fail. */
const EXAMPLE: WasteRule[] = [
  { max_pieces: 15, pct: 25 },
  { max_pieces: 30, pct: 50 },
  { max_pieces: 45, pct: 75 },
  { max_pieces: 60, pct: 100 },
];

type Row = { max: string; pct: string };

/**
 * The user's waste table: plates of up to N pieces are quoted with X % more filament (failed pieces,
 * purges, leftovers). Each plate's pieces pick the row; above the last row, the last one.
 */
export function WasteRules() {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();
  const [rows, setRows] = useState<Row[]>(() => (profile?.waste_rules ?? []).map((rule) => ({ max: String(rule.max_pieces), pct: String(rule.pct) })));
  const [saved, setSaved] = useState(false);
  const set = (index: number, change: Partial<Row>) => setRows(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));

  function submit(event: FormEvent) {
    event.preventDefault();
    const rules = rows.filter((row) => row.max.trim() !== "").map((row) => ({ max_pieces: Math.round(num(row.max)), pct: num(row.pct) }));
    if (rules.some((rule) => rule.max_pieces < 1)) return setError("Cada renglón necesita su número de piezas (1 o más).");
    if (rules.some((rule) => rule.pct < 0 || rule.pct > 500)) return setError("El porcentaje va de 0% a 500%.");
    const sorted = [...rules].sort((a, b) => a.max_pieces - b.max_pieces);
    if (sorted.some((rule, index) => index > 0 && rule.max_pieces === sorted[index - 1].max_pieces)) return setError("Hay dos renglones con el mismo número de piezas.");
    setSaved(false);
    save(
      () => supabase().from("profiles").update({ waste_rules: sorted }).eq("id", profile!.id),
      () => {
        setRows(sorted.map((rule) => ({ max: String(rule.max_pieces), pct: String(rule.pct) })));
        setSaved(true);
      },
    );
  }

  return (
    <form onSubmit={submit} className="card flex max-w-2xl flex-col gap-3">
      <div>
        <h2>Merma de filamento por placa</h2>
        <p className="text-sm text-muted">
          Cuánto filamento de más cotizas según las piezas que lleva la placa (piezas que salen mal, purgas, sobrantes). Por ejemplo, una placa de 10 piezas
          con 100 g y «hasta 15 piezas: 25%» se cotiza con 125 g. Solo cambia la cotización; en las impresiones se descuenta el filamento real.
        </p>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted">Sin merma: el filamento se cotiza tal cual.</p>}
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-end gap-2">
          <label className="label">
            {index === 0 ? "De 1 hasta" : `De ${Math.round(num(rows[index - 1].max)) + 1 || "…"} hasta`}
            <span className="flex items-center gap-2 font-normal">
              <input className="input" style={{ width: "6rem" }} type="number" min={1} step={1} value={row.max} onChange={(event) => set(index, { max: event.target.value })} />
              piezas
            </span>
          </label>
          <label className="label">
            Filamento de más
            <span className="flex items-center gap-2 font-normal">
              <input className="input" style={{ width: "6rem" }} type="number" min={0} step="any" value={row.pct} onChange={(event) => set(index, { pct: event.target.value })} />%
            </span>
          </label>
          <button type="button" className="btn mb-0.5" aria-label="Quitar renglón" onClick={() => setRows(rows.filter((_, position) => position !== index))}>
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setRows([...rows, { max: "", pct: "" }])}>
          + Renglón
        </button>
        <button type="button" className="btn" onClick={() => setRows(EXAMPLE.map((rule) => ({ max: String(rule.max_pieces), pct: String(rule.pct) })))}>
          Usar ejemplo (15 → 25%, 30 → 50%, 45 → 75%, 60 → 100%)
        </button>
      </div>
      <p className="text-xs text-muted">Arriba del último renglón se usa su porcentaje.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-sm text-brand">Guardado: tus productos ya se cotizan con esta merma.</p>}
      <button className="btn btn-primary self-start" disabled={busy}>
        {busy ? "Guardando…" : "Guardar merma"}
      </button>
    </form>
  );
}
