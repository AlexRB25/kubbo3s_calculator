"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { boxesFor, kg, parcelWeights, PROTECTIONS, sizeLabel, VOLUMETRIC_DIVISOR } from "@/lib/box-fit";
import { packagingName } from "@/lib/costs";
import { money } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { CatalogPackaging, Packaging } from "@/lib/types";

export type SizeDraft = { length: string; width: string; height: string; margin: string };

const mm = (cm: string) => Math.round((Number(cm.replace(",", ".")) || 0) * 10);

/**
 * The finished product's measures and how it goes protected, and the smallest of the workshop's boxes it fits
 * in. When none does, it says so and suggests boxes of the Kubbo catalog that would.
 */
export function BoxAdvisor({ draft, onChange, packaging, chosen, onPick, hint }: {
  draft: SizeDraft;
  onChange: (draft: SizeDraft) => void;
  packaging: Packaging[];
  chosen: string;
  onPick: (id: string) => void;
  /** Where the suggested measures came from (the biggest piece of the 3MF). */
  hint?: string;
}) {
  const size: [number, number, number] = [mm(draft.length), mm(draft.width), mm(draft.height)];
  const margin = mm(draft.margin);
  const ready = size.every((value) => value > 0);
  const fitting = ready ? boxesFor(size, packaging, margin) : [];
  const best = fitting[0];
  const [catalog, setCatalog] = useState<CatalogPackaging[] | null>(null);
  const needCatalog = ready && !best;

  useEffect(() => {
    if (!needCatalog || catalog) return;
    let current = true;
    supabase()
      .from("packaging_catalog")
      .select("*")
      .order("sort")
      .then(({ data }) => current && setCatalog((data ?? []) as CatalogPackaging[]));
    return () => {
      current = false;
    };
  }, [needCatalog, catalog]);

  const fromCatalog = needCatalog && catalog ? boxesFor(size, catalog as unknown as Packaging[], margin).slice(0, 3) : [];
  const set = (patch: Partial<SizeDraft>) => onChange({ ...draft, ...patch });
  const cm = (value: number) => `${Math.round(value) / 10}`.replace(/\.0$/, "");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:col-span-2">
      <div>
        <p className="text-sm font-semibold">Medidas del producto armado</p>
        <p className="text-xs text-muted">{hint ?? "Con ellas te decimos qué caja de tu embalaje usar."}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["length", "width", "height"] as const).map((key, index) => (
          <label key={key} className="label">
            {["Largo", "Ancho", "Alto"][index]} (cm)
            <input className="input" inputMode="decimal" value={draft[key]} placeholder="0" onChange={(event) => set({ [key]: event.target.value })} />
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">¿Cómo va protegido?</span>
        <div className="flex flex-wrap gap-2">
          {PROTECTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`btn py-1 text-xs ${margin === option.value ? "btn-on" : ""}`}
              onClick={() => set({ margin: String(option.value / 10) })}
            >
              {option.label} <span className="text-muted">{option.hint}</span>
            </button>
          ))}
          <label className="flex items-center gap-1 text-xs text-muted">
            Otra:
            <input className="input w-16 py-1 text-xs" inputMode="decimal" value={draft.margin} onChange={(event) => set({ margin: event.target.value })} />
            cm
          </label>
        </div>
      </div>

      {ready &&
        (best ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-money/10 p-3 text-sm">
            <span>
              {best.box.id === chosen ? "Usas la caja recomendada: " : "Te recomendamos: "}
              <strong>{packagingName(best.box)}</strong> · {money(best.box.cost)}
              <span className="block text-xs text-muted">
                Con {sizeLabel(size.map((value) => value + margin))} de producto protegido le sobran {cm(best.spare)} cm en su lado más justo.
                {fitting.length > 1 && ` También cabe en ${fitting.length - 1} ${fitting.length === 2 ? "caja más" : "cajas más"}.`}
              </span>
            </span>
            {best.box.id !== chosen && (
              <button type="button" className="btn btn-primary py-1 text-xs" onClick={() => onPick(best.box.id)}>
                Usar esta caja
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-warn/10 p-3 text-sm">
            <span>
              <strong>Ninguna de tus cajas le queda.</strong> Protegido mide {sizeLabel(size.map((value) => value + margin))}.
            </span>
            {fromCatalog.length > 0 && (
              <span className="text-xs text-muted">
                Del catálogo Kubbo le quedan:{" "}
                {fromCatalog.map(({ box }) => `${box.name} (${sizeLabel([box.length_mm, box.width_mm, box.height_mm])})`).join(" · ")}.{" "}
                <Link href="/app/embalaje" className="text-brand">
                  Agrégala en Embalaje →
                </Link>
              </span>
            )}
            {catalog && fromCatalog.length === 0 && <span className="text-xs text-muted">Tampoco hay una en el catálogo: registra una caja a la medida en Embalaje.</span>}
          </div>
        ))}
    </div>
  );
}

/**
 * What to write in an online store (Mercado Libre, TikTok Shop, Amazon…) for the product shipped in its box:
 * the package's measures, the real weight (piece + box), the volumetric one and the one carriers bill.
 */
export function ParcelFacts({ productGrams, box }: { productGrams: number; box: Packaging }) {
  const [copied, setCopied] = useState("");
  if (!(box.length_mm > 0 && box.width_mm > 0 && box.height_mm > 0)) return null;
  const weights = parcelWeights(productGrams, box);
  const cm = (value: number) => `${Math.round(Number(value)) / 10}`.replace(/\.0$/, "");
  const rows: { label: string; value: string; copy: string; strong?: boolean }[] = [
    { label: "Medidas del paquete", value: sizeLabel([box.length_mm, box.width_mm, box.height_mm]), copy: `${cm(box.length_mm)} x ${cm(box.width_mm)} x ${cm(box.height_mm)}` },
    { label: "Peso de la pieza", value: `${Math.round(productGrams)} g`, copy: String(Math.round(productGrams)) },
    { label: `Peso de la caja${weights.estimated ? " (estimado)" : ""}`, value: `${weights.boxGrams} g`, copy: String(weights.boxGrams) },
    { label: "Peso real con caja", value: kg(weights.real), copy: (Math.ceil(weights.real * 100) / 100).toFixed(2) },
    { label: `Peso volumétrico (÷ ${VOLUMETRIC_DIVISOR})`, value: kg(weights.volumetric), copy: (Math.ceil(weights.volumetric * 100) / 100).toFixed(2) },
    { label: "Peso que cobra la paquetería", value: kg(weights.billable), copy: (Math.ceil(weights.billable * 100) / 100).toFixed(2), strong: true },
  ];

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(""), 1500);
      },
      () => {},
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3 sm:col-span-2">
      <div>
        <p className="text-sm font-semibold">Para tu tienda en línea</p>
        <p className="text-xs text-muted">Lo que piden Mercado Libre, TikTok Shop y las paqueterías, sin pesar nada. Toca un dato para copiarlo.</p>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={() => copy(row.copy, row.label)}
            className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-raised ${row.strong ? "bg-brand/10" : "bg-raised/40"}`}
          >
            <span className="text-muted">{row.label}</span>
            <span className={`tabular-nums ${row.strong ? "font-bold text-brand" : "font-semibold"}`}>{copied === row.label ? "Copiado" : row.value}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {weights.volumetric > weights.real
          ? "La caja es más grande que pesada: te cobran por volumen. Una caja más chica bajaría el envío."
          : "Te cobran por peso real: la caja ya es del tamaño justo."}
        {weights.estimated && " El peso de la caja es un cálculo por sus medidas; si la pesas, escríbelo en Embalaje."}
      </p>
    </div>
  );
}
