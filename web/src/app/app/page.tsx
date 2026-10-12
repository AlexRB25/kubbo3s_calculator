"use client";

import Link from "next/link";
import { useState } from "react";
import { Line, PageHeader, Stat } from "@/components/app/ui";
import { filamentName } from "@/lib/costs";
import { useData } from "@/lib/data";
import { day, isoDay, money, weight } from "@/lib/format";

/** Days ahead that a scheduled maintenance starts showing up as pending. */
const MAINTENANCE_NOTICE_DAYS = 7;

export default function SummaryPage() {
  const { profile, sales, expenses, filaments, jobs, printers, maintenance } = useData();
  const [offset, setOffset] = useState(0);

  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const monthKey = isoDay(month).slice(0, 7);
  const monthSales = sales.filter((sale) => isoDay(new Date(sale.sold_at)).startsWith(monthKey));
  const monthExpenses = expenses.filter((expense) => expense.spent_at.startsWith(monthKey));

  const income = monthSales.reduce((total, sale) => total + sale.quantity * sale.unit_price, 0);
  const channelCosts = monthSales.reduce((total, sale) => total + sale.fees + sale.shipping_cost, 0);
  const production = monthSales.reduce((total, sale) => total + sale.quantity * sale.unit_cost, 0);
  const profit = monthSales.reduce((total, sale) => total + sale.profit, 0);
  const spent = monthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const cashFlow = income - channelCosts - spent;

  const lowFilaments = filaments.filter((filament) => filament.stock_g <= filament.low_stock_g);
  const printing = jobs.filter((job) => job.status === "printing");
  const limit = new Date();
  limit.setDate(limit.getDate() + MAINTENANCE_NOTICE_DAYS);
  // Only each printer's latest record counts: doing the maintenance replaces the old reminder.
  const dueMaintenance = printers.flatMap((printer) => {
    const latest = maintenance.find((record) => record.printer_id === printer.id);
    return latest?.next_due && latest.next_due <= isoDay(limit) ? [{ printer, record: latest }] : [];
  });

  return (
    <>
      <PageHeader title={profile?.business_name || "Resumen"}>
        <button className="btn" onClick={() => setOffset(offset - 1)} aria-label="Mes anterior">
          ←
        </button>
        <span className="min-w-40 self-center text-center text-sm font-semibold capitalize">
          {month.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
        </span>
        <button className="btn" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label="Mes siguiente">
          →
        </button>
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ventas" value={money(income)} hint={`${monthSales.length} ventas`} />
        <Stat label="Ganancia de las ventas" value={money(profit)} tone={profit >= 0 ? "good" : "bad"} />
        <Stat label="Gastos" value={money(spent)} hint={`${monthExpenses.length} registros`} />
        <Stat label="Flujo de caja" value={money(cashFlow)} tone={cashFlow >= 0 ? "good" : "bad"} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="card flex flex-col gap-2">
          <h2>De la venta a la ganancia</h2>
          <Line label="Ventas" value={money(income)} />
          <Line label="Comisiones y envíos" value={`− ${money(channelCosts)}`} />
          <Line label="Costo de producir lo vendido" value={`− ${money(production)}`} />
          <Line strong label="Ganancia de las ventas" value={money(profit)} />
          <p className="text-xs text-muted">
            El flujo de caja es lo que entró menos lo que pagaste este mes (ventas − comisiones y envíos − gastos). La ganancia
            compara cada venta con lo que costó producirla.
          </p>
        </div>

        <div className="card flex flex-col gap-3">
          <h2>Pendientes</h2>
          {printing.length + lowFilaments.length + dueMaintenance.length === 0 && (
            <p className="text-sm text-muted">Nada pendiente: sin impresiones en curso, filamento suficiente y mantenimientos al día.</p>
          )}
          {printing.map((job) => (
            <p key={job.id} className="flex justify-between gap-3 text-sm">
              <span>
                <span className="text-warn">Imprimiendo</span> · {job.quantity} × {job.product_name}
              </span>
              <Link href="/app/impresiones" className="text-brand hover:underline">
                Terminar
              </Link>
            </p>
          ))}
          {lowFilaments.map((filament) => (
            <p key={filament.id} className="flex justify-between gap-3 text-sm">
              <span>
                <span className="text-bad">Filamento bajo</span> · {filamentName(filament)}
              </span>
              <span className="tabular-nums text-muted">{weight(filament.stock_g)}</span>
            </p>
          ))}
          {dueMaintenance.map(({ printer, record }) => (
            <p key={printer.id} className="flex justify-between gap-3 text-sm">
              <span>
                <span className={record.next_due! <= isoDay() ? "text-bad" : "text-warn"}>Mantenimiento</span> · {printer.name}
              </span>
              <span className="text-muted">{day(record.next_due!)}</span>
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
