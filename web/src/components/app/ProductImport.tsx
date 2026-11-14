"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { isLink, parseImport, photoKey, productFields, templateSheets, type ImportRow } from "@/lib/product-import";
import { useSession } from "@/lib/session";
import { supabase, uploadProductImage } from "@/lib/supabase";
import { readTable, writeXlsx } from "@/lib/xlsx";
import { Modal } from "./ui";

/** Quick load of products from an Excel (or CSV) sheet: name, SKU, description, categories, photos, stock and prices. */
export function ProductImport({ onClose }: { onClose: () => void }) {
  const { products, channels, shop, reload } = useData();
  const { session } = useSession();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<{ created: number; updated: number; notes: string[] } | null>(null);

  const photoFile = (name: string) => photos.find((file) => photoKey(file.name) === photoKey(name));
  const wanted = [...new Set(rows.flatMap((row) => row.photos.filter((photo) => !isLink(photo))))];
  const missingPhotos = wanted.filter((name) => !photoFile(name));
  const valid = rows.filter((row) => !row.error);

  function downloadTemplate() {
    const bytes = writeXlsx(templateSheets(channels));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    link.download = "plantilla-productos-kubbo3d.xlsx";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function pickSheet(file: File | undefined) {
    if (!file) return;
    setReport(null);
    setError("");
    setFileName(file.name);
    try {
      const parsed = parseImport(readTable(new Uint8Array(await file.arrayBuffer())), channels, products);
      setRows(parsed.rows);
      if (parsed.error) setError(parsed.error);
    } catch {
      setRows([]);
      setError("No pude leer el archivo. Guárdalo como Excel (.xlsx) o CSV e inténtalo de nuevo.");
    }
  }

  /** A photo of the sheet as a file: one of the picked ones, or downloaded from its link. */
  async function photoAsFile(entry: string): Promise<File | string> {
    if (!isLink(entry)) return photoFile(entry) ?? `no elegiste la foto ${entry}`;
    try {
      const response = await fetch(entry);
      const blob = await response.blob();
      if (!response.ok || !blob.type.startsWith("image/")) return `el enlace ${entry} no es una imagen`;
      return new File([blob], "foto", { type: blob.type });
    } catch {
      return `no se pudo descargar ${entry} (el sitio no lo permite: descárgala y elígela como archivo)`;
    }
  }

  async function run() {
    if (!session) return;
    setBusy(true);
    setError("");
    const owner = shop?.shop_id ?? session.user.id;
    const notes: string[] = [];
    let created = 0;
    let updated = 0;
    for (const [index, row] of valid.entries()) {
      setProgress(`Producto ${index + 1} de ${valid.length}: ${row.name ?? row.sku}`);
      const paths: string[] = [];
      for (const entry of row.photos) {
        const file = await photoAsFile(entry);
        if (typeof file === "string") {
          notes.push(`Fila ${row.line}: ${file}.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          notes.push(`Fila ${row.line}: ${entry} pesa más de 10 MB.`);
          continue;
        }
        const upload = await uploadProductImage(owner, file);
        if (upload.error) notes.push(`Fila ${row.line}: no se pudo subir ${entry} (${upload.error.message}).`);
        else paths.push(upload.path);
      }
      const existing = products.find((product) => product.id === row.existingId);
      const fields = productFields(row, paths, existing);
      const result = existing ? await supabase().from("products").update(fields).eq("id", existing.id) : await supabase().from("products").insert(fields);
      if (result.error) notes.push(`Fila ${row.line}: no se guardó (${result.error.message}).`);
      else if (existing) updated++;
      else created++;
    }
    for (const row of rows.filter((item) => item.error)) notes.push(`Fila ${row.line}: se saltó (${row.error}).`);
    await reload();
    setBusy(false);
    setProgress("");
    setReport({ created, updated, notes });
    setRows([]);
    setFileName("");
    setPhotos([]);
  }

  return (
    <Modal wide title="Carga rápida desde Excel" onClose={busy ? () => {} : onClose}>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
        <li>Descarga la plantilla y llena una fila por producto (nombre, SKU, descripción, categorías, fotos, stock y precios).</li>
        <li>Súbela aquí. Si en «Fotos» pusiste nombres de archivo, elige esas fotos; también puedes poner enlaces https://.</li>
        <li>Revisa la lista y dale Importar. Los productos con el mismo SKU (o nombre) se actualizan, no se duplican.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={downloadTemplate}>
          Descargar plantilla
        </button>
        <label className="btn btn-primary cursor-pointer">
          {fileName ? "Cambiar archivo" : "Subir Excel o CSV"}
          <input
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              pickSheet(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        {wanted.length > 0 && (
          <label className="btn cursor-pointer">
            {photos.length ? `Fotos elegidas: ${photos.length}` : `Elegir las fotos (${wanted.length})`}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(event) => setPhotos([...photos, ...Array.from(event.target.files ?? [])])}
            />
          </label>
        )}
      </div>
      {fileName && <p className="text-sm">Archivo: {fileName}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {missingPhotos.length > 0 && (
        <p className="text-sm text-warn">
          Faltan {missingPhotos.length} {missingPhotos.length === 1 ? "foto" : "fotos"}: {missingPhotos.slice(0, 8).join(", ")}
          {missingPhotos.length > 8 ? "…" : ""}. Elígelas o esos productos se guardan sin ellas.
        </p>
      )}

      {rows.length > 0 && (
        <div className="max-h-96 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-panel text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Fila</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Fotos</th>
                <th className="px-3 py-2">Qué pasa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.line} className="border-t border-line/60">
                  <td className="px-3 py-2 text-muted">{row.line}</td>
                  <td className="px-3 py-2">
                    {row.name ?? <span className="text-muted">(sin cambio)</span>}
                    {row.categories && <span className="block text-xs text-muted">{row.categories.join(", ")}</span>}
                  </td>
                  <td className="px-3 py-2">{row.sku ?? ""}</td>
                  <td className="px-3 py-2">
                    {row.photos.length > 0 && `${row.photos.filter((photo) => isLink(photo) || photoFile(photo)).length}/${row.photos.length}`}
                  </td>
                  <td className="px-3 py-2">
                    {row.error ? (
                      <span className="text-bad">Se salta: {row.error}</span>
                    ) : row.existingId ? (
                      <span className="text-warn">Actualiza el que ya tienes</span>
                    ) : (
                      <span className="text-money">Nuevo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={busy || !valid.length} onClick={run}>
            {busy ? "Importando…" : `Importar ${valid.length} ${valid.length === 1 ? "producto" : "productos"}`}
          </button>
          {busy && <span className="text-sm text-muted">{progress}</span>}
        </div>
      )}

      {report && (
        <div className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm">
          <p className="font-semibold">
            Listo: {report.created} {report.created === 1 ? "producto nuevo" : "productos nuevos"} y {report.updated}{" "}
            {report.updated === 1 ? "actualizado" : "actualizados"}.
          </p>
          <p className="text-muted">Para que calcule su costo, abre cada uno y en la pestaña Impresión elige sus filamentos e impresoras con sus placas.</p>
          {report.notes.map((note) => (
            <p key={note} className="text-warn">
              {note}
            </p>
          ))}
        </div>
      )}
    </Modal>
  );
}
