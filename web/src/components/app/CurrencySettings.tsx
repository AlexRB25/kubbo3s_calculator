"use client";

import { useState } from "react";
import { CURRENCIES, loadRates, type Currency } from "@/lib/currency";
import { useData, useSave } from "@/lib/data";
import { moneyIn } from "@/lib/format";
import { supabase } from "@/lib/supabase";

/**
 * The workshop's currency. Changing it asks whether to convert every amount already written (prices,
 * costs, purchases, sales…) at today's rate, or only change the currency they are shown in.
 */
export function CurrencySettings() {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();
  const current = profile?.currency ?? "MXN";
  const [chosen, setChosen] = useState<Currency>(current);
  const [factor, setFactor] = useState<number | null>(null);
  const [done, setDone] = useState("");

  async function choose(currency: Currency) {
    setChosen(currency);
    setDone("");
    setError("");
    setFactor(null);
    if (currency === current) return;
    const rates = await loadRates();
    setFactor(rates[currency] / rates[current]);
  }

  function change(convert: boolean) {
    if (convert && !factor) return setError("Todavía no carga el tipo de cambio; espera un momento.");
    const to = chosen;
    save(
      () => supabase().rpc("change_currency", { p_from: current, p_to: to, p_factor: convert ? factor : null }),
      () => setDone(convert ? `Listo: todo quedó en ${to}, convertido al tipo de cambio de hoy.` : `Listo: tu taller ahora usa ${to}. Las cantidades no cambiaron.`),
    );
  }

  const label = (code: Currency) => CURRENCIES.find((item) => item.code === code)?.label ?? code;
  const example = 250;

  return (
    <div className="card flex max-w-2xl flex-col gap-3">
      <div>
        <h2>Moneda</h2>
        <p className="text-sm text-muted">
          Tus costos y precios se escriben y se muestran en ella. Lo que te recomendamos en pesos mexicanos (como el precio de referencia de los filamentos del
          catálogo) se convierte al tipo de cambio del día.
        </p>
      </div>
      <label className="label">
        Moneda del taller
        <select className="input" value={chosen} onChange={(event) => choose(event.target.value as Currency)} disabled={busy}>
          {CURRENCIES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      {chosen !== current && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <p className="text-sm">
            Vas a cambiar de <strong>{label(current)}</strong> a <strong>{label(chosen)}</strong>.{" "}
            {factor ? (
              <>
                Tipo de cambio de hoy: {moneyIn(1, current)} {current} = {moneyIn(factor, chosen, 4)} {chosen}. Por ejemplo, un precio de {moneyIn(example, current)}{" "}
                quedaría en {moneyIn(example * factor, chosen)}.
              </>
            ) : (
              "Cargando el tipo de cambio…"
            )}
          </p>
          <p className="text-sm text-muted">
            ¿Convertimos lo que ya escribiste? Precios de venta, costos de filamentos y materiales, compras y gastos, luz, gastos fijos, impresoras, embalaje,
            paqueterías, comisiones fijas, mantenimientos y ventas.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy || !factor} onClick={() => change(true)}>
              {busy ? "Convirtiendo…" : "Cambiar y convertir todo"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => change(false)}>
              Solo cambiar la moneda
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => choose(current)}>
              Cancelar
            </button>
          </div>
          <p className="text-xs text-muted">«Solo cambiar la moneda» deja los números igual: úsalo si ya los escribiste en {chosen}.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {done && <p className="text-sm text-money">{done}</p>}
    </div>
  );
}
