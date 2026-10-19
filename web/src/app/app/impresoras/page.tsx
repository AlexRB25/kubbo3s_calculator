"use client";

import { useState } from "react";
import { PrinterForm } from "@/components/app/PrinterForm";
import { Empty, FieldsForm, Line, Modal, PageHeader, type FieldDef } from "@/components/app/ui";
import { useData, useSave } from "@/lib/data";
import { day, duration, isoDay, money } from "@/lib/format";
import { MAINTENANCE_KINDS, maintenanceLabel } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Printer } from "@/lib/types";

const SERVICE_FIELDS: FieldDef[] = [
  { name: "kind", label: "Tipo", type: "select", required: true, options: MAINTENANCE_KINDS },
  { name: "performed_at", label: "Fecha", type: "date", required: true },
  { name: "title", label: "¿Qué se hizo?", required: true, wide: true, placeholder: "Cambio de boquilla 0.4" },
  { name: "notes", label: "Detalles", type: "textarea", placeholder: "Valores antes y después, piezas cambiadas…" },
  { name: "cost", label: "Costo ($)", type: "number", hint: "Si pones costo, también queda como gasto." },
  { name: "next_due", label: "Próximo mantenimiento", type: "date", hint: "Opcional. Aparece en Resumen una semana antes." },
];

export default function PrintersPage() {
  const { printers, maintenance, jobs } = useData();
  const { error, save } = useSave();
  const [editing, setEditing] = useState<Printer | "new" | null>(null);
  const [servicing, setServicing] = useState<Printer | null>(null);
  const current = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <>
      <PageHeader title="Impresoras">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nueva impresora
        </button>
      </PageHeader>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {printers.length === 0 && (
        <Empty>Da de alta tus impresoras para llevar sus horas, mantenimientos y ajustes, y sumar luz y desgaste al costo.</Empty>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {printers.map((printer) => {
          const history = maintenance.filter((record) => record.printer_id === printer.id);
          const printerJobs = jobs.filter((job) => job.printer_id === printer.id);
          const failed = printerJobs.filter((job) => job.status === "failed").length;
          return (
            <article key={printer.id} className="card flex flex-col gap-3">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2>{printer.name}</h2>
                  <p className="text-sm text-muted">
                    {[printer.brand, printer.model].filter(Boolean).join(" ")}
                    {printer.device_id && ` · ID ${printer.device_id}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={() => setServicing(printer)}>
                    Registrar servicio
                  </button>
                  <button className="btn" onClick={() => setEditing(printer)}>
                    Editar
                  </button>
                </div>
              </header>
              <div className="flex flex-col gap-1">
                <Line
                  label={printer.initial_minutes > 0 ? `Tiempo impreso (${duration(printer.initial_minutes)} antes de registrarla)` : "Tiempo impreso"}
                  value={duration(printer.print_minutes + printer.initial_minutes)}
                />
                {printer.purchase_price > 0 && <Line label="Te costó" value={money(printer.purchase_price)} />}
                <Line label="Impresiones" value={`${printerJobs.length}${failed ? ` (${failed} fallidas)` : ""}`} />
                <Line label="Consumo / desgaste por hora" value={`${printer.power_watts} W / ${money(printer.hourly_cost)}`} />
                <Line label="Gastado en mantenimiento" value={money(history.reduce((total, record) => total + record.cost, 0))} />
                {history[0]?.next_due && <Line strong label="Próximo mantenimiento" value={day(history[0].next_due)} />}
              </div>

              <h3 className="text-sm font-semibold">Historial de mantenimientos y ajustes</h3>
              {history.length === 0 && <p className="text-sm text-muted">Sin registros todavía.</p>}
              <ul className="flex flex-col gap-2">
                {history.map((record) => (
                  <li key={record.id} className="flex items-start justify-between gap-3 border-t border-line/60 pt-2 text-sm">
                    <div>
                      <p>{record.title}</p>
                      <p className="text-xs text-muted">
                        {maintenanceLabel(record.kind)} · {day(record.performed_at)}
                        {record.cost > 0 && ` · ${money(record.cost)}`}
                      </p>
                      {record.notes && <p className="mt-1 whitespace-pre-line text-xs text-muted">{record.notes}</p>}
                    </div>
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        if (window.confirm(`Se eliminará "${record.title}"${record.cost ? " y su gasto" : ""}. ¿Eliminar?`)) {
                          save(() => supabase().from("maintenance").delete().eq("id", record.id));
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {editing && (
        <Modal title={current?.name ?? "Nueva impresora"} onClose={() => setEditing(null)}>
          <PrinterForm printer={current} onDone={() => setEditing(null)} />
        </Modal>
      )}

      {servicing && (
        <Modal title={`Servicio de ${servicing.name}`} onClose={() => setServicing(null)}>
          <FieldsForm
            fields={SERVICE_FIELDS}
            initial={{ kind: "maintenance", performed_at: isoDay() }}
            onDone={() => setServicing(null)}
            onSubmit={(values) => supabase().from("maintenance").insert({ ...values, printer_id: servicing.id })}
          />
        </Modal>
      )}
    </>
  );
}
