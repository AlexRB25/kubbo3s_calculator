"use client";

import { useData, useSave } from "@/lib/data";
import { getWorkshopCurrency } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { NumberFormat } from "@/lib/types";

const DECIMALS: { value: NonNullable<NumberFormat["decimals"]>; label: string }[] = [
  { value: "auto", label: "Según mi moneda" },
  { value: "dot", label: "1,234.56" },
  { value: "comma", label: "1.234,56" },
];

/** Separators of thousands and decimals, and whether amounts carry the currency code. */
export function NumberFormatSettings() {
  const { profile } = useData();
  const { busy, error, save } = useSave();
  if (!profile || profile.number_format === undefined) return null;
  const format: NumberFormat = profile.number_format ?? {};
  const currency = getWorkshopCurrency();

  const write = (next: NumberFormat) => save(() => supabase().from("profiles").update({ number_format: { ...format, ...next } }).eq("id", profile.id));

  return (
    <div className="card flex max-w-2xl flex-col gap-3">
      <div>
        <h2>Formato de números</h2>
        <p className="text-sm text-muted">Cómo se ven los precios en toda la calculadora, la app y tus cotizaciones.</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Miles y decimales</span>
        <div className="flex flex-wrap gap-2">
          {DECIMALS.map((option) => (
            <button
              key={option.value}
              className={`btn ${(format.decimals ?? "auto") === option.value ? "border-brand text-brand" : ""}`}
              disabled={busy}
              onClick={() => write({ decimals: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Mostrar la moneda como</span>
        <div className="flex flex-wrap gap-2">
          <button className={`btn ${!format.code ? "border-brand text-brand" : ""}`} disabled={busy} onClick={() => write({ code: false })}>
            Símbolo ($15.00)
          </button>
          <button className={`btn ${format.code ? "border-brand text-brand" : ""}`} disabled={busy} onClick={() => write({ code: true })}>
            Con código ($15.00 {currency})
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
