import Link from "next/link";
import { BarChart } from "@/components/BarChart";
import { count, kilos, percent, shortDay } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Overview = Record<string, number>;

type Daily = {
  day: string;
  signups: number;
  active: number;
  prints: number;
  sales: number;
  grams: number;
};

const RANGES = [7, 30, 90];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export default async function MetricsPage({ searchParams }: PageProps<"/">) {
  const requested = Number((await searchParams).dias);
  const days = RANGES.includes(requested) ? requested : 30;

  const db = admin();
  const [overview, daily] = await Promise.all([
    db.rpc("admin_overview").then(must) as Promise<Overview>,
    db.rpc("admin_daily", { p_days: days }).then(must) as Promise<Daily[]>,
  ]);

  const sum = (key: keyof Omit<Daily, "day">) => daily.reduce((total, row) => total + Number(row[key]), 0);
  const chart = (key: keyof Omit<Daily, "day">) =>
    daily.map((row) => ({ label: shortDay(row.day), value: Number(row[key]) }));

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>Métricas</h1>
        <nav className="flex gap-1" aria-label="Periodo">
          {RANGES.map((range) => (
            <Link
              key={range}
              href={`/?dias=${range}`}
              aria-current={range === days}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-raised aria-[current=true]:bg-raised aria-[current=true]:text-white"
            >
              {range} días
            </Link>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Usuarios registrados"
          value={count(overview.users)}
          hint={`${count(overview.users_today)} hoy · ${count(overview.users_7d)} en 7 días`}
        />
        <Stat label="Activos hoy" value={count(overview.dau)} hint={`${count(overview.wau)} en 7 días · ${count(overview.mau)} en 30`} />
        <Stat
          label="Activos del mes / registrados"
          value={percent(overview.mau, overview.users)}
          hint="Abrieron la app en los últimos 30 días"
        />
        <Stat label="Filamento impreso" value={kilos(overview.grams_printed)} hint="Registrado por todos los usuarios" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <BarChart title="Usuarios activos por día" summary={`${count(overview.dau)} hoy`} points={chart("active")} format={count} />
        <BarChart title="Registros por día" summary={count(sum("signups"))} points={chart("signups")} format={count} />
        <BarChart title="Impresiones registradas por día" summary={count(sum("prints"))} points={chart("prints")} format={count} />
        <BarChart title="Ventas registradas por día" summary={count(sum("sales"))} points={chart("sales")} format={count} />
      </section>

      <h2>Adopción</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label="Crearon al menos un producto"
          value={percent(overview.users_with_product, overview.users)}
          hint={`${count(overview.users_with_product)} de ${count(overview.users)} usuarios`}
        />
        <Stat
          label="Registraron una impresión"
          value={percent(overview.users_with_print, overview.users)}
          hint={`${count(overview.users_with_print)} de ${count(overview.users)} usuarios`}
        />
        <Stat
          label="Registraron una venta"
          value={percent(overview.users_with_sale, overview.users)}
          hint={`${count(overview.users_with_sale)} de ${count(overview.users)} usuarios`}
        />
      </section>

      <h2>Contenido creado</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Productos" value={count(overview.products)} />
        <Stat label="Impresoras" value={count(overview.printers)} hint={`${count(overview.maintenance)} mantenimientos y ajustes`} />
        <Stat label="Filamentos" value={count(overview.filaments)} hint={`${count(overview.suppliers)} proveedores`} />
        <Stat
          label="Impresiones"
          value={count(overview.print_jobs)}
          hint={`${percent(overview.print_jobs_failed, overview.print_jobs)} fallidas`}
        />
        <Stat label="Ventas" value={count(overview.sales)} hint={`${count(overview.pieces_sold)} piezas`} />
        <Stat label="Gastos" value={count(overview.expenses)} />
      </section>
    </>
  );
}
