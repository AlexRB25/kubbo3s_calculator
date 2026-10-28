"use client";

import { useState, type ChangeEvent } from "react";
import { Modal } from "@/components/app/ui";
import { filamentName } from "@/lib/costs";
import { duration, weight } from "@/lib/format";
import { matchFilament, matchPrinter, readSlice, type SliceReport } from "@/lib/slice";
import type { Filament, Printer } from "@/lib/types";

/** One plate as it goes into the product form: grams already by the user's filament ids. */
export type ImportedPlate = { name: string; minutes: number; grams: Record<string, number>; pieces: number };
export type SliceImportResult = { printerId: string; plates: ImportedPlate[]; thumbnail: File | null };

type Review = {
  report: SliceReport;
  fileName: string;
  printerId: string;
  /** Slot of the slicer ("plate:slot") → the user's filament chosen for it. */
  choices: Record<string, string>;
};

const STEPS = [
  ["Carga y lamina", "Abre tu modelo en Bambu Studio u OrcaSlicer con tu impresora y filamentos, y dale a «Laminar placa»."],
  ["Revisa", "Que el tiempo, los soportes y los colores (AMS) sean los que vas a imprimir."],
  ["Exporta la placa", "Arriba a la derecha, en el menú de «Imprimir placa», elige «Exportar la placa de impresión actual» (o «todas las placas»). Ese 3MF trae el tiempo y los gramos."],
];

/**
 * "Importar desde el laminador": reads a sliced 3MF or G-code, proposes the user's printer and the filament of the
 * nearest colour for each one the slicer used, and lets them correct it before filling the plates.
 */
export function SliceImport({ filaments, printers, onApply }: { filaments: Filament[]; printers: Printer[]; onApply: (result: SliceImportResult) => void }) {
  const [help, setHelp] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const report = readSlice(new Uint8Array(await file.arrayBuffer()), file.name);
      const choices: Record<string, string> = {};
      for (const plate of report.plates) {
        for (const sliced of plate.filaments) choices[`${plate.index}:${sliced.slot}`] = matchFilament(sliced, filaments).filament?.id ?? "";
      }
      setReview({ report, fileName: file.name, printerId: matchPrinter(report.printerModel, printers)?.id ?? "", choices });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!review) return;
    const { report, choices, printerId } = review;
    const plates = report.plates.map((plate) => {
      const grams: Record<string, number> = {};
      for (const sliced of plate.filaments) {
        const id = choices[`${plate.index}:${sliced.slot}`];
        // Two slots with the same spool of the user add up.
        if (id) grams[id] = Math.round(((grams[id] ?? 0) + sliced.grams) * 100) / 100;
      }
      return { name: report.plates.length > 1 ? `Placa ${plate.index}` : "Placa 1", minutes: Math.round(plate.minutes), grams, pieces: plate.objects.length };
    });
    const png = report.plates.find((plate) => plate.thumbnail)?.thumbnail;
    const thumbnail = png ? new File([png.slice()], "placa.png", { type: "image/png" }) : null;
    onApply({ printerId, plates, thumbnail });
    setReview(null);
  }

  const missing = review ? Object.values(review.choices).some((id) => !id) : false;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-brand/50 bg-brand/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-primary cursor-pointer">
          {busy ? "Leyendo…" : "Importar desde el laminador"}
          <input type="file" accept=".3mf,.gcode,.gco,.bgcode" className="sr-only" onChange={choose} disabled={busy} />
        </label>
        <span className="text-xs text-muted">3MF laminado de Bambu Studio u OrcaSlicer, o G-code de PrusaSlicer, Orca o Cura: llena tiempo, gramos, colores e impresora.</span>
        <button type="button" className="text-xs text-brand hover:underline" onClick={() => setHelp(!help)}>
          {help ? "Ocultar pasos" : "¿Cómo lo exporto?"}
        </button>
      </div>
      {help && (
        <ol className="grid gap-2 sm:grid-cols-3">
          {STEPS.map(([title, text], index) => (
            <li key={title} className="rounded-md bg-ink p-2 text-xs">
              <p className="font-semibold">
                Paso {index + 1}. {title}
              </p>
              <p className="mt-1 text-muted">{text}</p>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      {review && (
        <Modal title="Importar desde el laminador" onClose={() => setReview(null)} wide>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              {review.fileName} · {review.report.slicer}
              {review.report.printerModel && ` · laminado para ${review.report.printerModel}`}
            </p>
            {review.report.warnings.map((warning) => (
              <p key={warning} className="text-sm text-warn">
                {warning}
              </p>
            ))}

            <label className="label">
              Impresora
              <select className="input" value={review.printerId} onChange={(event) => setReview({ ...review, printerId: event.target.value })}>
                <option value="">Elegir…</option>
                {printers.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {printer.name}
                  </option>
                ))}
              </select>
              {!review.printerId && (
                <span className="font-normal text-warn">
                  {review.report.printerModel ? `No tienes registrada una ${review.report.printerModel}: elige en cuál la imprimes.` : "Elige en qué impresora sale."}
                </span>
              )}
            </label>

            {review.report.plates.map((plate) => (
              <div key={plate.index} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <p className="font-semibold">
                  {review.report.plates.length > 1 ? `Placa ${plate.index}` : "Placa"} · {duration(plate.minutes)}
                  {plate.objects.length > 0 && ` · ${plate.objects.length} ${plate.objects.length === 1 ? "pieza" : "piezas"}`}
                </p>
                {plate.filaments.map((sliced) => {
                  const key = `${plate.index}:${sliced.slot}`;
                  const chosen = filaments.find((item) => item.id === review.choices[key]);
                  const close = chosen ? matchFilament(sliced, [chosen]).close : false;
                  return (
                    <div key={key} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="size-5 shrink-0 rounded-full border border-line" style={{ background: sliced.color || "transparent" }} title={`En el laminador: ${sliced.color}`} />
                      <span className="w-40">
                        {sliced.type || "Filamento"} {sliced.slot > 1 || plate.filaments.length > 1 ? `#${sliced.slot}` : ""} · {weight(sliced.grams)}
                      </span>
                      <span className="text-muted">→</span>
                      <span className="size-5 shrink-0 rounded-full border border-line" style={{ background: chosen?.color_hex ?? "transparent" }} />
                      <select
                        className="input min-w-48 flex-1"
                        value={review.choices[key] ?? ""}
                        aria-label={`Tu filamento para ${sliced.type} ${sliced.color}`}
                        onChange={(event) => setReview({ ...review, choices: { ...review.choices, [key]: event.target.value } })}
                      >
                        <option value="">Elegir…</option>
                        {filaments.map((item) => (
                          <option key={item.id} value={item.id}>
                            {filamentName(item)}
                          </option>
                        ))}
                      </select>
                      {chosen && !close && <span className="text-xs text-warn">Color o material distinto: revísalo</span>}
                    </div>
                  );
                })}
              </div>
            ))}

            <p className="text-xs text-muted">
              Los gramos del laminador ya traen la purga y la torre de los cambios de color. Tu merma de Ajustes (las piezas que salen mal) se sigue sumando
              aparte en el costo.
            </p>
            {filaments.length === 0 && <p className="text-sm text-warn">Primero da de alta tus filamentos en Filamento.</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn" onClick={() => setReview(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={!review.printerId || missing} onClick={apply}>
                Llenar las placas
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
