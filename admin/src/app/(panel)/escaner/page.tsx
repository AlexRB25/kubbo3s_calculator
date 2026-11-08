import { deleteScanPack, saveScanPack, saveScanSettings } from "@/app/actions";
import { admin, must } from "@/lib/supabase/admin";

type Settings = { api_cost_usd: number; margin_pct: number; enabled: boolean };
type Pack = { id: string; scans: number; active: boolean; sort: number };
type ScanRow = { id: string; user_id: string; name: string; kind: string; status: string; source: string; error: string; created_at: string };
type Purchase = { id: string; scans: number; price_usd: number; status: string; paid_amount: number | null; paid_currency: string | null; created_at: string };

/** KIRI's credit balance, when its key is set in this panel too. */
async function kiriBalance(): Promise<number | null> {
  if (!process.env.KIRI_API_KEY) return null;
  try {
    const response = await fetch("https://api.kiriengine.app/api/v1/open/balance", { headers: { Authorization: `Bearer ${process.env.KIRI_API_KEY}` }, cache: "no-store" });
    const body = await response.json();
    return body?.ok ? Number(body.data?.balance) : null;
  } catch {
    return null;
  }
}

/** The 3D scanner: what KIRI charges, Kubbo3D's margin, the packs on sale and the latest scans. */
export default async function ScannerPage() {
  const settings = must(await admin().from("scan_settings").select("*").eq("id", true).maybeSingle()) as Settings | null;
  if (!settings) return <p className="card text-muted">Falta ejecutar la parte del escáner de supabase/schema.sql.</p>;
  const packs = must(await admin().from("scan_packs").select("*").order("sort")) as Pack[];
  const scans = must(await admin().from("scans").select("id, user_id, name, kind, status, source, error, created_at").order("created_at", { ascending: false }).limit(40)) as ScanRow[];
  const purchases = must(await admin().from("scan_purchases").select("id, scans, price_usd, status, paid_amount, paid_currency, created_at").order("created_at", { ascending: false }).limit(20)) as Purchase[];
  const balance = await kiriBalance();
  const price = Math.round(Number(settings.api_cost_usd) * (1 + Number(settings.margin_pct) / 100) * 100) / 100;
  const done = scans.filter((scan) => scan.status === "done").length;

  return (
    <>
      <header>
        <h1>Escáner 3D</h1>
        <p className="text-sm text-muted">Fotogrametría de KIRI Engine. Se necesita suscripción activa; cada plan trae escaneos al mes (columna scans_month de plans) y se venden paquetes.</p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card">
          <p className="text-sm text-muted">Créditos en KIRI</p>
          <p className="text-3xl font-black">{balance ?? "—"}</p>
          <p className="text-xs text-muted">{balance === null ? "Pon KIRI_API_KEY en este panel para verlos." : "1 crédito = 1 escaneo. Recarga mínima: 500."}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">Precio de un escaneo</p>
          <p className="text-3xl font-black">USD {price.toFixed(2)}</p>
          <p className="text-xs text-muted">
            Costo USD {Number(settings.api_cost_usd).toFixed(2)} + {Number(settings.margin_pct)} % = ganas USD {(price - Number(settings.api_cost_usd)).toFixed(2)} por escaneo (antes de la comisión de Stripe).
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">Últimos 40 escaneos</p>
          <p className="text-3xl font-black">{done} listos</p>
          <p className="text-xs text-muted">{scans.filter((scan) => scan.status === "failed").length} fallidos (no se cobran al usuario)</p>
        </div>
      </section>

      <form action={saveScanSettings} className="card grid max-w-3xl gap-4 sm:grid-cols-3">
        <label className="label">
          Lo que cobra KIRI por escaneo (USD)
          <input name="api_cost_usd" type="number" min={0} step="0.01" defaultValue={settings.api_cost_usd} className="input" />
        </label>
        <label className="label">
          Margen Kubbo3D (%)
          <input name="margin_pct" type="number" min={0} step="0.5" defaultValue={settings.margin_pct} className="input" />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input name="enabled" type="checkbox" defaultChecked={settings.enabled} />
          Escáner encendido
        </label>
        <div className="sm:col-span-3">
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>

      <section className="card flex max-w-3xl flex-col gap-3">
        <h2>Paquetes a la venta</h2>
        {packs.map((pack) => (
          <div key={pack.id} className="flex flex-wrap items-end gap-3">
            <form action={saveScanPack} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={pack.id} />
              <label className="label w-28">
                Escaneos
                <input name="scans" type="number" min={1} step={1} defaultValue={pack.scans} className="input" />
              </label>
              <label className="label w-20">
                Orden
                <input name="sort" type="number" step={1} defaultValue={pack.sort} className="input" />
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input name="active" type="checkbox" defaultChecked={pack.active} />
                Visible
              </label>
              <span className="pb-2 text-sm text-muted">USD {(pack.scans * price).toFixed(2)}</span>
              <button className="btn">Guardar</button>
            </form>
            <form action={deleteScanPack}>
              <input type="hidden" name="id" value={pack.id} />
              <button className="btn text-bad">Quitar</button>
            </form>
          </div>
        ))}
        <form action={saveScanPack} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <input type="hidden" name="id" value="" />
          <label className="label w-28">
            Escaneos
            <input name="scans" type="number" min={1} step={1} className="input" required />
          </label>
          <label className="label w-20">
            Orden
            <input name="sort" type="number" step={1} defaultValue={packs.length + 1} className="input" />
          </label>
          <input type="hidden" name="active" value="on" />
          <button className="btn btn-primary">Agregar paquete</button>
        </form>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4">Últimas compras de paquetes</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th className="num">Escaneos</th>
              <th className="num">Precio</th>
              <th>Cobrado</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.id}>
                <td>{new Date(purchase.created_at).toLocaleString("es-MX")}</td>
                <td className="num">{purchase.scans}</td>
                <td className="num">USD {Number(purchase.price_usd).toFixed(2)}</td>
                <td>{purchase.paid_amount ? `${purchase.paid_amount} ${purchase.paid_currency}` : "—"}</td>
                <td>{purchase.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4">Últimos escaneos</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Nombre</th>
              <th>Con</th>
              <th>De</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((scan) => (
              <tr key={scan.id}>
                <td>{new Date(scan.created_at).toLocaleString("es-MX")}</td>
                <td>
                  {scan.name || "—"}
                  <span className="block text-xs text-muted">{scan.user_id}</span>
                </td>
                <td>{scan.kind === "video" ? "Video" : "Fotos"}</td>
                <td>{scan.source === "plan" ? "Plan" : "Paquete"}</td>
                <td>
                  {scan.status}
                  {scan.error && <span className="block text-xs text-bad">{scan.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
