import { resolveReport, saveMarketSettings, setModelBlocked } from "@/app/actions";
import { money } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Settings = { fee_pct: number; min_payout: number; hold_days: number };
type ModelRow = {
  id: string;
  title: string;
  price: number;
  status: string;
  blocked: boolean;
  blocked_reason: string;
  downloads: number;
  sales: number;
  created_at: string;
  makers: { handle: string } | null;
};
type Report = { id: string; model_id: string; reason: string; details: string; created_at: string; models: { title: string; blocked: boolean } | null };

const REASONS: Record<string, string> = {
  copyright: "Derechos de autor",
  offensive: "Ofensivo o ilegal",
  broken: "Archivos rotos",
  other: "Otro",
};

/** Commission and payout rules, reports from users and every model, with a switch to hide one. */
export default async function MarketplacePage({ searchParams }: PageProps<"/marketplace">) {
  const params = await searchParams;
  const query = String(params.q ?? "").replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 60);
  const db = admin();
  const settings = must(await db.from("market_settings").select("*").eq("id", 1).single()) as Settings;
  const reports = must(
    await db.from("model_reports").select("id, model_id, reason, details, created_at, models(title, blocked)").eq("status", "new").order("created_at"),
  ) as unknown as Report[];
  let request = db.from("models").select("id, title, price, status, blocked, blocked_reason, downloads, sales, created_at, makers(handle)").order("created_at", { ascending: false }).limit(200);
  if (query) request = request.ilike("title", `%${query}%`);
  const models = must(await request) as unknown as ModelRow[];
  const paid = must(await db.from("model_purchases").select("price, fee").eq("status", "paid")) as { price: number; fee: number }[];
  const income = paid.reduce((total, row) => total + Number(row.fee), 0);
  const sold = paid.reduce((total, row) => total + Number(row.price), 0);
  const site = (process.env.WEB_URL ?? "").replace(/\/$/, "");

  return (
    <>
      <header>
        <h1>Modelos 3D</h1>
        <p className="text-sm text-muted">
          {paid.length} ventas por {money(sold)} · comisión de Kubbo {money(income)}. Mercado Pago cobra su propia comisión de lo que entra.
        </p>
      </header>

      <form action={saveMarketSettings} className="card grid max-w-3xl gap-4 sm:grid-cols-3">
        <label className="label">
          Comisión de Kubbo (%)
          <input name="fee_pct" type="number" min={0} max={90} step="0.5" defaultValue={settings.fee_pct} className="input" required />
          <span className="font-normal">Sobre el precio; vale para las compras nuevas.</span>
        </label>
        <label className="label">
          Retiro mínimo (MXN)
          <input name="min_payout" type="number" min={0} step="1" defaultValue={settings.min_payout} className="input" required />
        </label>
        <label className="label">
          Días de espera
          <input name="hold_days" type="number" min={0} max={120} step="1" defaultValue={settings.hold_days} className="input" required />
          <span className="font-normal">Antes de poder retirar una venta (reembolsos).</span>
        </label>
        <div className="sm:col-span-3">
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>

      <section className="flex flex-col gap-2">
        <h2>Denuncias pendientes ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted">Nada que revisar.</p>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      {site ? (
                        <a href={`${site}/modelos/${report.model_id}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand">
                          {report.models?.title ?? "—"}
                        </a>
                      ) : (
                        report.models?.title
                      )}
                      <div className="text-xs text-warn">{REASONS[report.reason]}</div>
                      {report.details && <div className="max-w-md whitespace-pre-line text-xs text-muted">{report.details}</div>}
                    </td>
                    <td className="num">
                      <div className="flex flex-wrap justify-end gap-2">
                        {!report.models?.blocked && (
                          <form action={setModelBlocked} className="flex gap-2">
                            <input type="hidden" name="model_id" value={report.model_id} />
                            <input type="hidden" name="blocked" value="on" />
                            <input type="hidden" name="reason" value={REASONS[report.reason]} />
                            <button className="btn text-bad">Ocultar modelo</button>
                          </form>
                        )}
                        <form action={resolveReport}>
                          <input type="hidden" name="id" value={report.id} />
                          <button className="btn">Descartar</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2>Modelos</h2>
          <form className="flex gap-2">
            <input name="q" defaultValue={query} placeholder="Buscar por nombre" className="input w-56" />
            <button className="btn">Buscar</button>
          </form>
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Autor</th>
                <th>Estado</th>
                <th className="num">Precio</th>
                <th className="num">Descargas</th>
                <th className="num">Ventas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.id}>
                  <td>
                    {site && model.status === "published" && !model.blocked ? (
                      <a href={`${site}/modelos/${model.id}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand">
                        {model.title}
                      </a>
                    ) : (
                      model.title
                    )}
                  </td>
                  <td className="text-sm">@{model.makers?.handle}</td>
                  <td className={model.blocked ? "text-bad" : model.status === "published" ? "text-money" : "text-muted"}>
                    {model.blocked ? `Oculto${model.blocked_reason ? `: ${model.blocked_reason}` : ""}` : model.status === "published" ? "Publicado" : "Borrador"}
                  </td>
                  <td className="num">{Number(model.price) > 0 ? money(model.price) : "Gratis"}</td>
                  <td className="num">{model.downloads}</td>
                  <td className="num">{model.sales}</td>
                  <td className="num">
                    <form action={setModelBlocked} className="flex justify-end gap-2">
                      <input type="hidden" name="model_id" value={model.id} />
                      {!model.blocked && (
                        <>
                          <input type="hidden" name="blocked" value="on" />
                          <input name="reason" placeholder="Motivo" className="input w-32" />
                        </>
                      )}
                      <button className={`btn ${model.blocked ? "" : "text-bad"}`}>{model.blocked ? "Mostrar" : "Ocultar"}</button>
                    </form>
                  </td>
                </tr>
              ))}
              {models.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted">
                    No hay modelos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
