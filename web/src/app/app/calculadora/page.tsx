"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Line, PageHeader, Switch } from "@/components/app/ui";
import { costPerGram, filamentName, overheadPerPiece, packagingName, priceLevels, wastePct } from "@/lib/costs";
import { useData } from "@/lib/data";
import { money, num } from "@/lib/format";
import { DRAFT_KEY, quickCost, type QuoteDraft } from "@/lib/quotes";

type Use = { filament: string; perKg: string; grams: string };

const OTHER = "otro";

export default function QuickCalculatorPage() {
  const { profile, filaments, printers, packaging } = useData();
  const router = useRouter();
  const levels = priceLevels(profile);
  const taxDefault = Number(profile?.quote_settings?.tax_pct ?? 16);

  const [name, setName] = useState("");
  const [uses, setUses] = useState<Use[]>([{ filament: filaments[0]?.id ?? OTHER, perKg: "", grams: "" }]);
  const [hours, setHours] = useState("");
  const [printerId, setPrinterId] = useState(printers[0]?.id ?? "");
  const [waste, setWaste] = useState(String(wastePct(profile?.waste_rules, 1) || 10));
  const [post, setPost] = useState("");
  const [packagingId, setPackagingId] = useState("");
  const [withOverhead, setWithOverhead] = useState(overheadPerPiece(profile) > 0);
  const [profit, setProfit] = useState(String(levels.normal));
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("");
  const [withTax, setWithTax] = useState(taxDefault > 0);
  const [tax, setTax] = useState(String(taxDefault || 16));

  const printer = printers.find((item) => item.id === printerId) ?? null;
  const box = packaging.find((item) => item.id === packagingId);
  const grams = uses.reduce((total, use) => total + num(use.grams), 0);
  const cost = quickCost({
    filaments: uses.map((use) => {
      const filament = filaments.find((item) => item.id === use.filament);
      return { grams: num(use.grams), costPerGram: filament ? costPerGram(filament) : num(use.perKg) / 1000 };
    }),
    minutes: num(hours) * 60,
    printer,
    kwhPrice: profile?.kwh_price ?? 0,
    wastePct: num(waste),
    post: num(post),
    packaging: box?.cost ?? 0,
    overhead: withOverhead ? overheadPerPiece(profile) : 0,
  });
  const unit = cost.total * (1 + num(profit) / 100);
  const pieces = Math.max(1, Math.round(num(quantity)));
  const subtotal = unit * pieces;
  const off = (subtotal * num(discount)) / 100;
  const taxes = withTax ? ((subtotal - off) * num(tax)) / 100 : 0;
  const total = subtotal - off + taxes;

  const setUse = (index: number, patch: Partial<Use>) => setUses((list) => list.map((use, at) => (at === index ? { ...use, ...patch } : use)));

  function toQuote() {
    const materials = uses
      .filter((use) => num(use.grams) > 0)
      .map((use) => filaments.find((item) => item.id === use.filament))
      .filter(Boolean)
      .map((filament) => filamentName(filament!));
    const detail = [materials.join(", "), grams ? `${Math.round(grams)} g` : "", num(hours) ? `${num(hours)} h` : ""].filter(Boolean).join(" · ");
    const draft: QuoteDraft = {
      items: [{ name: name.trim() || "Pieza impresa en 3D", detail, quantity: pieces, unit_price: Math.round(unit * 100) / 100 }],
      discount_pct: num(discount),
      tax_pct: withTax ? num(tax) : 0,
    };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Without storage the quotes page opens an empty quote.
    }
    router.push("/app/cotizaciones?nueva=1");
  }

  const input = (value: string, set: (value: string) => void, placeholder = "0", unitLabel?: string) => (
    <div className="relative">
      <input className="input w-full pr-10" inputMode="decimal" value={value} placeholder={placeholder} onChange={(event) => set(event.target.value)} />
      {unitLabel && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">{unitLabel}</span>}
    </div>
  );

  return (
    <>
      <PageHeader title="Cálculo rápido" />
      <p className="text-sm text-muted">Calcula el precio de una pieza sin crear un producto. Si te lo encargan, conviértelo en cotización.</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <section className="card flex flex-col gap-4">
            <h2>La pieza</h2>
            <label className="label">
              ¿Qué es? (para la cotización)
              <input className="input" value={name} placeholder="Llavero personalizado" onChange={(event) => setName(event.target.value)} />
            </label>
            {uses.map((use, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                <label className="label">
                  {index === 0 ? "Filamento" : `Filamento ${index + 1}`}
                  <select className="input" value={use.filament} onChange={(event) => setUse(index, { filament: event.target.value })}>
                    {filaments.map((filament) => (
                      <option key={filament.id} value={filament.id}>
                        {filamentName(filament)}
                      </option>
                    ))}
                    <option value={OTHER}>Otro (escribo el precio por kg)</option>
                  </select>
                </label>
                {use.filament === OTHER ? (
                  <label className="label">
                    Precio por kg
                    {input(use.perKg, (value) => setUse(index, { perKg: value }), "350", "$")}
                  </label>
                ) : (
                  <span />
                )}
                <div className="flex items-end gap-2">
                  <label className="label flex-1">
                    Gramos
                    {input(use.grams, (value) => setUse(index, { grams: value }), "0", "g")}
                  </label>
                  {uses.length > 1 && (
                    <button type="button" className="btn" aria-label="Quitar filamento" onClick={() => setUses((list) => list.filter((_, at) => at !== index))}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="btn self-start" onClick={() => setUses((list) => [...list, { filament: filaments[0]?.id ?? OTHER, perKg: "", grams: "" }])}>
              + Otro color o material
            </button>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="label">
                Horas de impresión
                {input(hours, setHours, "0", "h")}
              </label>
              <label className="label">
                Impresora
                <select className="input" value={printerId} onChange={(event) => setPrinterId(event.target.value)}>
                  <option value="">Sin impresora (no suma luz ni desgaste)</option>
                  {printers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="card flex flex-col gap-4">
            <h2>Ajustes</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="label">
                Posprocesado (lijar, pintar, armar)
                {input(post, setPost, "0", "$")}
              </label>
              <label className="label">
                Empaque
                <select className="input" value={packagingId} onChange={(event) => setPackagingId(event.target.value)}>
                  <option value="">Sin empaque</option>
                  {packaging.map((item) => (
                    <option key={item.id} value={item.id}>
                      {packagingName(item)} · {money(item.cost)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Margen por fallas (merma)
                {input(waste, setWaste, "10", "%")}
              </label>
              <label className="label">
                Ganancia sobre el costo
                {input(profit, setProfit, "100", "%")}
              </label>
              <label className="label">
                Piezas
                {input(quantity, setQuantity, "1")}
              </label>
              <label className="label">
                Descuento
                {input(discount, setDiscount, "0", "%")}
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <span className="flex items-center gap-3 text-sm">
                <Switch checked={withTax} onChange={setWithTax} label="Sumar impuestos" />
                Sumar impuestos
                {withTax && <span className="w-24">{input(tax, setTax, "16", "%")}</span>}
              </span>
              {overheadPerPiece(profile) > 0 && (
                <span className="flex items-center gap-3 text-sm">
                  <Switch checked={withOverhead} onChange={setWithOverhead} label="Incluir gastos fijos" />
                  Incluir gastos fijos ({money(overheadPerPiece(profile))} por pieza)
                </span>
              )}
            </div>
          </section>
        </div>

        <aside className="card flex h-fit flex-col gap-2 lg:sticky lg:top-6">
          <h2>Resultado</h2>
          <Line label={`Filamento${num(waste) ? ` (+${num(waste)} % merma)` : ""}`} value={money(cost.filament)} />
          <Line label="Luz" value={money(cost.electricity)} />
          <Line label="Desgaste de la impresora" value={money(cost.machine)} />
          {cost.post > 0 && <Line label="Posprocesado" value={money(cost.post)} />}
          {cost.packaging > 0 && <Line label="Empaque" value={money(cost.packaging)} />}
          {cost.overhead > 0 && <Line label="Gastos fijos" value={money(cost.overhead)} />}
          <Line label="Costo por pieza" value={money(cost.total)} strong />
          <Line label={`Precio por pieza (+${num(profit)} %)`} value={money(unit)} strong />
          {pieces > 1 && <Line label={`× ${pieces} piezas`} value={money(subtotal)} />}
          {off > 0 && <Line label={`Descuento (${num(discount)} %)`} value={`−${money(off)}`} />}
          {taxes > 0 && <Line label={`Impuestos (${num(tax)} %)`} value={money(taxes)} />}
          <div className="mt-2 flex items-baseline justify-between rounded-xl bg-brand/15 px-4 py-3">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-black text-brand tabular-nums">{money(total)}</span>
          </div>
          <p className="text-xs text-muted">Ganas {money((unit - cost.total) * pieces - off)} antes de impuestos.</p>
          <button className="btn btn-primary mt-2" disabled={!(cost.total > 0)} onClick={toQuote}>
            Crear cotización con esto
          </button>
        </aside>
      </div>
    </>
  );
}
