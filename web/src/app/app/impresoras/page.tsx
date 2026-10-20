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
  const { printers, maintenance, jobs, wear } = useData();
  const { error, save } = useSave();
  const [editing, setEditing] = useState<Printer | "new" | null>(null);
  const [servicing, setServicing] = useState<Printer | null>(null);
  // The printer a payment into its wear fund is being recorded for.
  const [paying, setPaying] = useState<Printer | null>(null);
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
          const fund = wear.filter((entry) => entry.printer_id === printer.id);
          const worn = fund.filter((entry) => entry.kind === "wear").reduce((total, entry) => total + Number(entry.amount), 0);
          const paid = fund.filter((entry) => entry.kind === "payment").reduce((total, entry) => total + Number(entry.amount), 0);
          const balance = paid - worn;
          // Services, wear and payments, newest first.
          const timeline = [
            ...history.map((record) => ({ key: `m-${record.id}`, date: record.performed_at, record, entry: null })),
            ...fund.map((entry) => ({ key: `w-${entry.id}`, date: entry.happened_at, record: null, entry })),
          ].sort((a, b) => b.date.localeCompare(a.date));
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
                <div className="flex flex-wrap gap-2">
                  <button className="btn" onClick={() => setPaying(printer)}>
                    Registrar aporte
                  </button>
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

              <div className="flex flex-col gap-1 rounded-lg bg-ink p-3">
                <p className="text-sm font-semibold">Fondo de desgaste</p>
                <p className="text-xs text-muted">
                  Cada impresión carga sus horas × {money(printer.hourly_cost)} por hora. Registra lo que vas apartando para la máquina (boquillas, refacciones, reemplazarla).
                </p>
                <Line label="Desgaste acumulado" value={`− ${money(worn)}`} />
                <Line label="Aportado" value={money(paid)} />
                <p className={`flex justify-between gap-4 border-t border-line pt-2 text-sm font-semibold ${balance < 0 ? "text-bad" : "text-money"}`}>
                  <span>{balance < 0 ? "Debes al fondo" : "Saldo a favor"}</span>
                  <span className="tabular-nums">{money(Math.abs(balance))}</span>
                </p>
              </div>

              <h3 className="text-sm font-semibold">Historial: servicios, desgaste y aportes</h3>
              {timeline.length === 0 && <p className="text-sm text-muted">Sin registros todavía.</p>}
              <ul className="flex flex-col gap-2">
                {timeline.map(({ key, record, entry }) =>
                  entry ? (
                    <li key={key} className="flex items-start justify-between gap-3 border-t border-line/60 pt-2 text-sm">
                      <div>
                        <p>{entry.kind === "wear" ? entry.note || "Desgaste" : entry.note || "Aporte al fondo"}</p>
                        <p className="text-xs text-muted">
                          {entry.kind === "wear" ? "Desgaste (automático)" : "Aporte"} · {day(entry.happened_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums ${entry.kind === "wear" ? "text-bad" : "text-money"}`}>
                          {entry.kind === "wear" ? "− " : "+ "}
                          {money(entry.amount)}
                        </span>
                        {entry.kind === "payment" && (
                          <button
                            className="btn btn-danger"
                            onClick={() => {
                              if (window.confirm("Se eliminará este aporte del fondo. ¿Eliminar?")) save(() => supabase().from("printer_wear").delete().eq("id", entry.id));
                            }}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </li>
                  ) : record ? (
                  <li key={key} className="flex items-start justify-between gap-3 border-t border-line/60 pt-2 text-sm">
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
                  ) : null,
                )}
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

      {paying && (
        <Modal title={`Aporte al fondo de ${paying.name}`} onClose={() => setPaying(null)}>
          <FieldsForm
            fields={[
              { name: "amount", label: "Monto ($)", type: "number", required: true, hint: "Lo que apartas para el desgaste de esta impresora." },
              { name: "happened_at", label: "Fecha", type: "date", required: true },
              { name: "note", label: "Nota", placeholder: "Aparté para boquillas, pagué la placa…" },
            ]}
            initial={{ happened_at: isoDay() }}
            onDone={() => setPaying(null)}
            onSubmit={(values) => {
              if (!(Number(values.amount) > 0)) return Promise.resolve({ error: { message: "Escribe el monto del aporte." } });
              return supabase().from("printer_wear").insert({ ...values, printer_id: paying.id, kind: "payment" });
            }}
          />
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
