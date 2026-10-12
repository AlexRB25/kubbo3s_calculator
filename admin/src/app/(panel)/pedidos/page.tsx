import Link from "next/link";
import { saveOrder } from "@/app/actions";
import { count, dateTime, money } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Order = {
  id: string;
  number: number;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string;
  status: keyof typeof STATUSES;
  tracking: string;
  payment_id: string | null;
  paid_at: string | null;
  subtotal: number;
  shipping: number;
  total: number;
  created_at: string;
  store_order_items: { id: string; name: string; unit_price: number; quantity: number }[];
};

const STATUSES = {
  pending: "Por pagar",
  paid: "Pagado",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export default async function OrdersPage({ searchParams }: PageProps<"/pedidos">) {
  const requested = String((await searchParams).estado ?? "");
  const status = requested in STATUSES ? requested : "";

  let request = admin().from("store_orders").select("*, store_order_items(*)").order("created_at", { ascending: false }).limit(100);
  if (status) request = request.eq("status", status);
  const orders = must(await request) as Order[];

  const tab = "rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-raised aria-[current=true]:bg-raised aria-[current=true]:text-white";

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>Pedidos</h1>
        <nav className="flex flex-wrap gap-1" aria-label="Estado">
          <Link href="/pedidos" aria-current={!status} className={tab}>
            Todos
          </Link>
          {Object.entries(STATUSES).map(([value, label]) => (
            <Link key={value} href={`/pedidos?estado=${value}`} aria-current={value === status} className={tab}>
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {orders.length === 0 && <p className="card text-muted">No hay pedidos{status ? " en este estado" : " todavía"}.</p>}

      {orders.map((order) => (
        <article key={order.id} className="card grid gap-4 lg:grid-cols-[1fr_1fr_16rem]">
          <div className="flex flex-col gap-1 text-sm">
            <h2>
              #{order.number} · {money(order.total)}
            </h2>
            <p className="text-xs text-muted">{dateTime(order.created_at)}</p>
            {order.payment_id && (
              <p className="text-xs text-money">
                Pagado con Mercado Pago · pago {order.payment_id}
                {order.paid_at && ` · ${dateTime(order.paid_at)}`}
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-1">
              {order.store_order_items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>
                    {count(item.quantity)} × {item.name}
                  </span>
                  <span className="tabular-nums text-muted">{money(item.unit_price * item.quantity)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 text-muted">
                <span>Envío</span>
                <span className="tabular-nums">{money(order.shipping)}</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <p className="font-semibold">{order.customer_name}</p>
            <p className="text-muted">
              {order.email} · {order.phone}
            </p>
            <p>
              {order.address}
              <br />
              {[order.city, order.state, order.postal_code].filter(Boolean).join(", ")}
            </p>
            {order.notes && <p className="whitespace-pre-line text-muted">Nota: {order.notes}</p>}
          </div>

          <form action={saveOrder} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={order.id} />
            <label className="label">
              Estado
              <select name="status" defaultValue={order.status} className="input">
                {Object.entries(STATUSES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Guía de envío
              <input name="tracking" defaultValue={order.tracking} className="input" placeholder="Paquetería y número" />
            </label>
            <button className="btn">Guardar</button>
            <p className="text-xs text-muted">Cancelar regresa las piezas al stock.</p>
          </form>
        </article>
      ))}
      {orders.length === 100 && <p className="text-xs text-muted">Se muestran los 100 pedidos más recientes.</p>}
    </>
  );
}
