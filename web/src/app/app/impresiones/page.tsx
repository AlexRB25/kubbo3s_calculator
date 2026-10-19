"use client";

import { useState } from "react";
import { Empty, Modal, PageHeader, TableCard } from "@/components/app/ui";
import { filamentName, recipeFor } from "@/lib/costs";
import { useData, useSave } from "@/lib/data";
import { day, duration, num, weight } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { PrintJob, PrintStatus, Product } from "@/lib/types";

type UseRow = { filament_id: string; grams: string };

const STATUS: Record<PrintStatus, { label: string; tone: string }> = {
  printing: { label: "Imprimiendo", tone: "text-warn" },
  done: { label: "Terminada", tone: "text-money" },
  failed: { label: "Falló", tone: "text-bad" },
};

const recipeRows = (product: Product | undefined): UseRow[] =>
  product?.filaments.length ? product.filaments.map((use) => ({ filament_id: use.filament_id, grams: "" })) : [{ filament_id: "", grams: "" }];

/**
 * Sends something to print, or corrects / finishes an existing print (`job`). Empty fields fall
 * back to what the product's recipe says, shown as the placeholder.
 */
function PrintForm({ job, onDone }: { job?: PrintJob; onDone: () => void }) {
  const { products, printers, filaments } = useData();
  const { busy, error, setError, save } = useSave();

  const [productId, setProductId] = useState(job?.product_id ?? "");
  const product = products.find((item) => item.id === productId);
  const [customName, setCustomName] = useState(job && !job.product_id ? job.product_name : "");
  const [printerId, setPrinterId] = useState(job?.printer_id ?? "");
  const [quantity, setQuantity] = useState(String(job?.quantity ?? 1));
  const [status, setStatus] = useState<PrintStatus>(job?.status ?? "printing");
  const [good, setGood] = useState(job?.status === "done" ? String(job.good_quantity) : "");
  const [minutes, setMinutes] = useState(job ? String(job.minutes) : "");
  const [notes, setNotes] = useState(job?.notes ?? "");
  const [rows, setRows] = useState<UseRow[]>(
    job
      ? job.print_job_filaments.flatMap((use) => (use.filament_id ? [{ filament_id: use.filament_id, grams: String(use.grams) }] : []))
      : recipeRows(undefined),
  );

  const pieces = Math.max(Math.round(num(quantity)), 0);
  // What the product takes on the chosen printer: the sum of its plates there.
  const recipe = product ? recipeFor(product, printerId) : { filaments: [], minutes: 0 };
  const recipeGrams = (filamentId: string) => (recipe.filaments.find((use) => use.filament_id === filamentId)?.grams ?? 0) * pieces;
  const recipeMinutes = recipe.minutes * pieces;

  function chooseProduct(next: string) {
    const chosen = products.find((item) => item.id === next);
    setProductId(next);
    setRows(recipeRows(chosen));
    if (chosen?.printer_ids.length && !chosen.printer_ids.includes(printerId)) setPrinterId(chosen.printer_ids[0]);
  }

  const setRow = (index: number, change: Partial<UseRow>) =>
    setRows(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = product?.name ?? customName.trim();
    if (!name) return setError("Elige un producto o escribe qué vas a imprimir.");
    if (pieces < 1) return setError("Indica cuántas piezas son.");
    const goodPieces = status === "done" ? (good === "" ? pieces : Math.round(num(good))) : 0;
    if (goodPieces > pieces) return setError("No pueden salir más piezas buenas de las que mandaste a imprimir.");

    save(
      () =>
        supabase().rpc("save_print", {
          p_id: job?.id ?? null,
          p_product: productId || null,
          p_name: name,
          p_printer: printerId || null,
          p_quantity: pieces,
          p_good: goodPieces,
          p_status: status,
          p_minutes: minutes === "" ? recipeMinutes : Math.round(num(minutes)),
          p_notes: notes.trim(),
          p_filaments: rows.flatMap((row) =>
            row.filament_id ? [{ filament_id: row.filament_id, grams: row.grams === "" ? recipeGrams(row.filament_id) : num(row.grams) }] : [],
          ),
        }),
      onDone,
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="label sm:col-span-2">
        Producto
        <select className="input" value={productId} onChange={(event) => chooseProduct(event.target.value)}>
          <option value="">Otra cosa (sin producto)</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.stock} en stock
            </option>
          ))}
        </select>
      </label>
      {!product && (
        <label className="label sm:col-span-2">
          ¿Qué vas a imprimir?
          <input className="input" value={customName} onChange={(event) => setCustomName(event.target.value)} maxLength={80} />
        </label>
      )}
      <label className="label">
        Piezas
        <input className="input" type="number" min={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </label>
      <label className="label">
        Tiempo (min)
        <input className="input" type="number" min={0} value={minutes} onChange={(event) => setMinutes(event.target.value)} placeholder={String(recipeMinutes)} />
        {minutes === "" && recipeMinutes > 0 && <span className="font-normal">Según el producto: {duration(recipeMinutes)}.</span>}
      </label>
      <label className="label">
        Impresora
        <select className="input" value={printerId} onChange={(event) => setPrinterId(event.target.value)}>
          <option value="">Sin impresora</option>
          {printers.map((printer) => (
            <option key={printer.id} value={printer.id}>
              {printer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Estado
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value as PrintStatus)}>
          {Object.entries(STATUS).map(([value, item]) => (
            <option key={value} value={value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {status === "done" && (
        <label className="label">
          Piezas buenas
          <input className="input" type="number" min={0} value={good} onChange={(event) => setGood(event.target.value)} placeholder={String(pieces)} />
          {product && <span className="font-normal">Entran al stock del producto.</span>}
        </label>
      )}

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-semibold">Filamento consumido</legend>
        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <label className="label flex-1">
              Filamento
              <select className="input" value={row.filament_id} onChange={(event) => setRow(index, { filament_id: event.target.value })}>
                <option value="">Elegir…</option>
                {filaments.map((filament) => (
                  <option key={filament.id} value={filament.id}>
                    {filamentName(filament)} · quedan {weight(filament.stock_g)}
                  </option>
                ))}
              </select>
            </label>
            <label className="label w-28">
              Gramos
              <input
                className="input"
                type="number"
                min={0}
                step="any"
                value={row.grams}
                onChange={(event) => setRow(index, { grams: event.target.value })}
                placeholder={String(recipeGrams(row.filament_id))}
              />
            </label>
            <button type="button" className="btn" aria-label="Quitar filamento" onClick={() => setRows(rows.filter((_, position) => position !== index))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn self-start" onClick={() => setRows([...rows, { filament_id: "", grams: "" }])}>
          + Otro filamento
        </button>
        <p className="text-xs text-muted">El filamento se descuenta al guardar, aunque la impresión siga en curso o haya fallado.</p>
      </fieldset>

      <label className="label sm:col-span-2">
        Notas
        <textarea className="input" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} />
      </label>

      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : job ? "Guardar cambios" : "Registrar impresión"}
        </button>
        {job && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm("El filamento vuelve a tu inventario y las piezas salen del stock. ¿Eliminar?")) {
                save(() => supabase().from("print_jobs").delete().eq("id", job.id), onDone);
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

export default function PrintsPage() {
  const { jobs, printers } = useData();
  const [editing, setEditing] = useState<PrintJob | "new" | null>(null);

  return (
    <>
      <PageHeader title="Impresiones">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Mandar a imprimir
        </button>
      </PageHeader>

      {jobs.length === 0 ? (
        <Empty>Registra cada impresión: el filamento que consume se descuenta solo y las piezas buenas entran a tu stock.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Impresión</th>
                <th>Impresora</th>
                <th className="num">Filamento</th>
                <th className="num">Tiempo</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="whitespace-nowrap text-muted">{day(job.created_at)}</td>
                  <td>
                    {job.quantity} × {job.product_name}
                  </td>
                  <td className="text-muted">{printers.find((printer) => printer.id === job.printer_id)?.name ?? "—"}</td>
                  <td className="num">{weight(job.print_job_filaments.reduce((total, use) => total + use.grams, 0))}</td>
                  <td className="num text-muted">{duration(job.minutes)}</td>
                  <td className={STATUS[job.status].tone}>
                    {STATUS[job.status].label}
                    {job.status === "done" && job.good_quantity < job.quantity && ` (${job.good_quantity} buenas)`}
                  </td>
                  <td className="num">
                    <button className="btn" onClick={() => setEditing(job)}>
                      {job.status === "printing" ? "Terminar" : "Editar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {editing && (
        <Modal wide title={editing === "new" ? "Mandar a imprimir" : `${editing.quantity} × ${editing.product_name}`} onClose={() => setEditing(null)}>
          <PrintForm job={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
