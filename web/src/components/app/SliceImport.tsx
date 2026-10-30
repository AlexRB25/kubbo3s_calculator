"use client";

import { useState, type ChangeEvent } from "react";
import { Swatch } from "@/components/app/Swatch";
import { Modal } from "@/components/app/ui";
import { filamentName } from "@/lib/costs";
import { duration, weight } from "@/lib/format";
import { filamentColors } from "@/lib/labels";
import { fitsPrinter, matchFilament, matchPrinter, neededPerProduct, pieceGroups, readSlice, type SliceReport } from "@/lib/slice";
import type { Filament, Printer } from "@/lib/types";

/** One plate as it goes into the product form: grams already by the user's filament ids. */
export type ImportedPlate = { name: string; minutes: number; grams: Record<string, number>; pieces: Record<string, number>; objects: number };
/** `parts` are the distinct pieces found (copies grouped), named as the user left them; empty when the file does not say. */
export type SliceImportResult = { printerId: string; plates: ImportedPlate[]; parts: { name: string; needed: number }[]; thumbnail: File | null };

/** A distinct piece of the file: `key` is how the slicer calls it, `name` and `needed` what the user typed. */
type PieceRow = { key: string; name: string; needed: string };

type Review = {
  report: SliceReport;
  fileName: string;
  printerId: string;
  /** Slot of the slicer ("plate:slot") → the user's filament chosen for it. */
  choices: Record<string, string>;
  pieces: PieceRow[];
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
      // Copies of one object are one piece: 18 objects can be 6 bodies, 6 right hands and 6 left hands.
      const totals = pieceGroups(report.plates.flatMap((plate) => plate.objects));
      const needed = neededPerProduct(totals.map((group) => group.count));
      const pieces = totals.map((group, index) => ({ key: group.name, name: group.name, needed: String(needed[index]) }));
      setReview({ report, fileName: file.name, printerId: matchPrinter(report.printerModel, printers)?.id ?? "", choices, pieces });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!review) return;
    const { report, choices, printerId } = review;
    // Pieces renamed alike are one piece.
    const nameOf = (key: string) => review.pieces.find((piece) => piece.key === key)?.name.trim() || key;
    const parts: SliceImportResult["parts"] = [];
    for (const piece of review.pieces) {
      const name = nameOf(piece.key);
      if (!parts.some((part) => part.name.toLowerCase() === name.toLowerCase())) parts.push({ name, needed: Math.max(1, Math.round(Number(piece.needed) || 1)) });
    }
    const plates = report.plates.map((plate) => {
      const grams: Record<string, number> = {};
      for (const sliced of plate.filaments) {
        const id = choices[`${plate.index}:${sliced.slot}`];
        // Two slots with the same spool of the user add up.
        if (id) grams[id] = Math.round(((grams[id] ?? 0) + sliced.grams) * 100) / 100;
      }
      const pieces: Record<string, number> = {};
      for (const group of pieceGroups(plate.objects)) {
        const name = parts.find((part) => part.name.toLowerCase() === nameOf(group.name).toLowerCase())?.name ?? group.name;
        pieces[name] = (pieces[name] ?? 0) + group.count;
      }
      return { name: report.plates.length > 1 ? `Placa ${plate.index}` : "Placa 1", minutes: Math.round(plate.minutes), grams, pieces, objects: plate.objects.length };
    });
    const png = report.plates.find((plate) => plate.thumbnail)?.thumbnail;
    const thumbnail = png ? new File([png.slice()], "placa.png", { type: "image/png" }) : null;
    onApply({ printerId, plates, parts, thumbnail });
    setReview(null);
  }

  const missing = review ? Object.values(review.choices).some((id) => !id) : false;
  // The G-code is made for one model: other printers cannot print it.
  const fits = review ? printers.filter((printer) => fitsPrinter(review.report.printerModel, printer)) : [];
  const objectCount = review ? review.report.plates.reduce((total, plate) => total + plate.objects.length, 0) : 0;
  const setPiece = (index: number, change: Partial<PieceRow>) =>
    review && setReview({ ...review, pieces: review.pieces.map((piece, position) => (position === index ? { ...piece, ...change } : piece)) });

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
              <select
                className="input"
                value={review.printerId}
                disabled={fits.length === 0}
                onChange={(event) => setReview({ ...review, printerId: event.target.value })}
              >
                <option value="">{fits.length ? "Elegir…" : "Sin impresoras compatibles"}</option>
                {printers.map((printer) => {
                  const fit = fits.includes(printer);
                  return (
                    <option key={printer.id} value={printer.id} disabled={!fit} className={fit ? undefined : "text-muted"}>
                      {printer.name}
                      {fit ? "" : " · no compatible"}
                    </option>
                  );
                })}
              </select>
              {fits.length === 0 ? (
                <span role="alert" className="font-normal text-bad">
                  No tienes impresoras compatibles para este archivo{review.report.printerModel && ` (se laminó para ${review.report.printerModel})`}. Lamínalo para una
                  de tus impresoras o da de alta esa impresora en Impresoras.
                </span>
              ) : (
                !review.printerId && <span className="font-normal text-warn">Elige en qué impresora sale.</span>
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
                      <Swatch colors={chosen ? filamentColors(chosen) : []} glow={chosen?.glow} className="size-5 shrink-0 rounded-full border border-line" />
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

            {review.pieces.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <p className="font-semibold">
                  {objectCount} {objectCount === 1 ? "objeto" : "objetos"} ·{" "}
                  {review.pieces.length === 1 ? "1 pieza" : `${review.pieces.length} piezas distintas`}
                  {objectCount > review.pieces.length && " (las copias se juntan)"}
                </p>
                <p className="text-xs text-muted">
                  Ponle a cada pieza el nombre que quieras y cuántas lleva un producto. Si dos son la misma, ponles el mismo nombre y se juntan.
                </p>
                {review.pieces.map((piece, index) => {
                  const copies = review.report.plates
                    .map((plate) => ({ plate, count: pieceGroups(plate.objects).find((group) => group.name === piece.key)?.count ?? 0 }))
                    .filter((item) => item.count > 0)
                    .map((item) => (review.report.plates.length > 1 ? `×${item.count} en placa ${item.plate.index}` : `×${item.count}`))
                    .join(", ");
                  return (
                    <div key={piece.key} className="flex flex-wrap items-center gap-2 text-sm">
                      <input className="input min-w-40 flex-1" value={piece.name} aria-label={`Nombre de ${piece.key}`} onChange={(event) => setPiece(index, { name: event.target.value })} />
                      <span className="w-32 text-muted">{copies}</span>
                      <label className="flex items-center gap-1 text-xs text-muted">
                        <input className="input w-16" inputMode="numeric" value={piece.needed} onChange={(event) => setPiece(index, { needed: event.target.value })} />
                        por producto
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

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
