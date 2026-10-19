"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSave } from "@/lib/data";
import { field, num } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { CatalogPrinter, Printer } from "@/lib/types";

const OTHER = "__otra";

/** "Bambu Lab A1 · 605": model (or brand) plus the end of the device id, to tell equal printers apart. */
export function printerName(brand: string, model: string, deviceId: string) {
  const base = [brand, model].filter(Boolean).join(" ") || "Impresora";
  const id = deviceId.trim();
  return id ? `${base} · ${id.length > 6 ? id.slice(-4) : id}` : base;
}

/**
 * A printer of the workshop: brand and model picked from the Kubbo catalog (or written when they
 * are not there), its device id or serial number, and what it costs to run.
 */
export function PrinterForm({ printer, onDone }: { printer?: Printer; onDone: () => void }) {
  const { busy, error, setError, save } = useSave();
  const [catalog, setCatalog] = useState<CatalogPrinter[]>([]);
  const [brand, setBrand] = useState(printer?.brand ?? "");
  const [model, setModel] = useState(printer?.model ?? "");
  // Typing by hand: the brand or model is not in the catalog.
  const [otherBrand, setOtherBrand] = useState(false);
  const [otherModel, setOtherModel] = useState(false);
  const [deviceId, setDeviceId] = useState(printer?.device_id ?? "");
  const [hours, setHours] = useState(field(Math.round((printer?.initial_minutes ?? 0) / 60)));
  const [watts, setWatts] = useState(field(printer?.power_watts));
  const [price, setPrice] = useState(field(printer?.purchase_price));
  const [lifeHours, setLifeHours] = useState(field(printer?.life_hours));
  // Left empty when it was the automatic one, so it follows a new price or life.
  const [hourlyCost, setHourlyCost] = useState(() =>
    printer && printer.purchase_price > 0 && printer.life_hours > 0 && Math.abs(printer.hourly_cost - printer.purchase_price / printer.life_hours) < 0.01
      ? ""
      : field(printer?.hourly_cost),
  );
  // Price ÷ life, used when the wear per hour is left empty.
  const autoWear = num(price) > 0 && num(lifeHours) > 0 ? Math.round((num(price) / num(lifeHours)) * 100) / 100 : 0;
  const [notes, setNotes] = useState(printer?.notes ?? "");

  useEffect(() => {
    let current = true;
    supabase()
      .from("printer_catalog")
      .select("*")
      .order("brand")
      .order("sort")
      .order("model")
      .then(({ data }) => {
        if (!current) return;
        const rows = (data ?? []) as CatalogPrinter[];
        setCatalog(rows);
        // A printer saved by hand (or before the catalog) opens with its own text.
        if (printer && !rows.some((row) => row.brand === printer.brand)) setOtherBrand(!!printer.brand || !!printer.model);
        else if (printer && !rows.some((row) => row.brand === printer.brand && row.model === printer.model)) setOtherModel(!!printer.model);
      });
    return () => {
      current = false;
    };
  }, [printer]);

  const brands = [...new Set(catalog.map((row) => row.brand))];
  const models = catalog.filter((row) => row.brand === brand);
  const picked = otherBrand || otherModel ? undefined : models.find((row) => row.model === model);

  function chooseBrand(value: string) {
    setOtherBrand(value === OTHER);
    setOtherModel(false);
    setBrand(value === OTHER ? "" : value);
    setModel("");
  }

  function chooseModel(value: string) {
    setOtherModel(value === OTHER);
    setModel(value === OTHER ? "" : value);
    const row = models.find((item) => item.model === value);
    if (row && row.power_watts > 0 && !num(watts)) setWatts(field(row.power_watts));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!brand.trim()) return setError("Elige o escribe la marca.");
    if (!model.trim()) return setError("Elige o escribe el modelo.");
    const row = {
      name: printerName(brand.trim(), model.trim(), deviceId),
      brand: brand.trim(),
      model: model.trim(),
      device_id: deviceId.trim(),
      catalog_id: picked?.id ?? null,
      initial_minutes: Math.round(num(hours) * 60),
      power_watts: num(watts),
      purchase_price: num(price),
      life_hours: Math.round(num(lifeHours)),
      hourly_cost: hourlyCost === "" ? autoWear : num(hourlyCost),
      notes: notes.trim(),
    };
    save(() => (printer ? supabase().from("printers").update(row).eq("id", printer.id) : supabase().from("printers").insert(row)), onDone);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="label">
        Marca
        <select className="input" value={otherBrand ? OTHER : brand} onChange={(event) => chooseBrand(event.target.value)}>
          <option value="">Elegir…</option>
          {brands.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          <option value={OTHER}>Otra marca…</option>
        </select>
        {otherBrand && <input className="input" value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Escribe la marca" maxLength={60} autoFocus />}
      </label>
      <label className="label">
        Modelo
        {otherBrand ? (
          <input className="input" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Escribe el modelo" maxLength={80} />
        ) : (
          <>
            <select className="input" value={otherModel ? OTHER : model} onChange={(event) => chooseModel(event.target.value)} disabled={!brand}>
              <option value="">{brand ? "Elegir…" : "Primero la marca"}</option>
              {models.map((item) => (
                <option key={item.id} value={item.model}>
                  {item.model}
                </option>
              ))}
              {brand && <option value={OTHER}>Otro modelo…</option>}
            </select>
            {otherModel && <input className="input" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Escribe el modelo" maxLength={80} autoFocus />}
          </>
        )}
      </label>
      <label className="label">
        ID o número de serie
        <input className="input" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="01P00A123456789" maxLength={60} />
        <span className="font-normal">Viene en la pantalla de la impresora o en su app. Distingue dos impresoras iguales.</span>
      </label>
      <label className="label">
        Horas que ya tiene (opcional)
        <input className="input" type="number" min={0} step={1} value={hours} onChange={(event) => setHours(event.target.value)} placeholder="0" />
        <span className="font-normal">Si ya la usabas; se suman a las horas de tus impresiones.</span>
      </label>
      <label className="label">
        ¿Cuánto te costó? ($)
        <input className="input" type="number" min={0} step="any" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" />
      </label>
      <label className="label">
        Vida útil (horas)
        <input className="input" type="number" min={0} step={1} value={lifeHours} onChange={(event) => setLifeHours(event.target.value)} placeholder="5000" />
        <span className="font-normal">Las horas que esperas que imprima antes de reemplazarla.</span>
      </label>
      <label className="label">
        Consumo (watts)
        <input className="input" type="number" min={0} step="any" value={watts} onChange={(event) => setWatts(event.target.value)} placeholder="0" />
        <span className="font-normal">Promedio mientras imprime.</span>
      </label>
      <label className="label">
        Desgaste por hora ($)
        <input
          className="input"
          type="number"
          min={0}
          step="any"
          value={hourlyCost}
          onChange={(event) => setHourlyCost(event.target.value)}
          placeholder={autoWear ? autoWear.toFixed(2) : "0"}
        />
        <span className="font-normal">{autoWear ? `Vacío usa ${autoWear.toFixed(2)}: lo que costó ÷ su vida útil.` : "Lo que costó ÷ horas de vida útil."}</span>
      </label>
      <label className="label sm:col-span-2">
        Notas
        <textarea className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} />
      </label>
      <p className="text-sm text-muted sm:col-span-2">
        Se mostrará como <strong>{printerName(brand.trim(), model.trim(), deviceId)}</strong>
      </p>
      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        {printer && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Se eliminará junto con su historial de mantenimientos y ajustes. ¿Eliminar?")) {
                save(() => supabase().from("printers").delete().eq("id", printer.id), onDone);
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
