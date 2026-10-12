import { count, dateTime, kilos } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type User = {
  id: string;
  email: string;
  name: string;
  business_name: string;
  created_at: string;
  last_seen_at: string;
  active_days_30: number;
  products: number;
  printers: number;
  filaments: number;
  print_jobs: number;
  sales: number;
  grams_printed: number;
};

const ORDERS = {
  recientes: { column: "last_seen_at", label: "Última visita" },
  nuevos: { column: "created_at", label: "Más nuevos" },
  activos: { column: "active_days_30", label: "Más días activos" },
  impresiones: { column: "print_jobs", label: "Más impresiones" },
  ventas: { column: "sales", label: "Más ventas" },
} as const;

export default async function UsersPage({ searchParams }: PageProps<"/usuarios">) {
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const orderKey = (String(params.orden ?? "") in ORDERS ? params.orden : "recientes") as keyof typeof ORDERS;

  let request = admin()
    .from("admin_users")
    .select("*", { count: "exact" })
    .order(ORDERS[orderKey].column, { ascending: false })
    .limit(100);
  // Only characters that can appear in a name or an email, so the filter string cannot be broken out of.
  const safe = query.replace(/[^\p{L}\p{N}@._+\- ]/gu, "");
  if (safe) request = request.or(`email.ilike.%${safe}%,name.ilike.%${safe}%,business_name.ilike.%${safe}%`);
  const result = await request;
  const users = must(result) as User[];

  return (
    <>
      <h1>Usuarios</h1>
      <form className="flex flex-wrap items-end gap-3">
        <label className="label min-w-48 flex-1">
          Buscar por correo, nombre o negocio
          <input name="q" defaultValue={query} className="input" />
        </label>
        <label className="label">
          Ordenar por
          <select name="orden" defaultValue={orderKey} className="input">
            {Object.entries(ORDERS).map(([key, order]) => (
              <option key={key} value={key}>
                {order.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">Aplicar</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Alta / última visita</th>
              <th className="num">Días activos (30)</th>
              <th className="num">Productos</th>
              <th className="num">Impresoras</th>
              <th className="num">Filamentos</th>
              <th className="num">Impresiones</th>
              <th className="num">Filamento impreso</th>
              <th className="num">Ventas</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.name || "Sin nombre"}
                  {user.business_name && <span className="text-muted"> · {user.business_name}</span>}
                  <br />
                  <span className="text-xs text-muted">{user.email}</span>
                </td>
                <td className="text-xs text-muted">
                  {dateTime(user.created_at)}
                  <br />
                  {dateTime(user.last_seen_at)}
                </td>
                <td className="num">{count(user.active_days_30)}</td>
                <td className="num">{count(user.products)}</td>
                <td className="num">{count(user.printers)}</td>
                <td className="num">{count(user.filaments)}</td>
                <td className="num">{count(user.print_jobs)}</td>
                <td className="num">{kilos(user.grams_printed)}</td>
                <td className="num">{count(user.sales)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={9} className="text-muted">
                  {query ? "No hay usuarios con esa búsqueda." : "Todavía no se registra nadie."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {count(result.count ?? users.length)} usuarios{query ? " con esa búsqueda" : ""}; se muestran hasta 100.
      </p>
    </>
  );
}
