import Link from "next/link";
import { saveBugReport } from "@/app/actions";
import { dateTime } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Report = {
  id: string;
  number: number;
  user_id: string | null;
  email: string;
  app: string;
  page: string;
  message: string;
  context: Record<string, unknown>;
  screenshot_path: string | null;
  status: keyof typeof STATUSES;
  admin_note: string;
  created_at: string;
};

const STATUSES = {
  new: "Nuevos",
  reviewing: "Revisando",
  fixed: "Resueltos",
  dismissed: "Descartados",
};

const APPS: Record<string, string> = { tools: "Herramientas", calculator: "Calculadora", landing: "Landing", mobile: "App" };

const show = (value: unknown) => (typeof value === "object" && value !== null ? JSON.stringify(value, null, 1) : String(value));

/** Links that only last an hour: the screenshot and the 3D file the user had open (from Mis archivos). */
async function attachments(report: Report) {
  const db = admin();
  const screenshot = report.screenshot_path ? (await db.storage.from("bug-reports").createSignedUrl(report.screenshot_path, 3600)).data?.signedUrl : undefined;
  let file: { name: string; url: string } | undefined;
  const opened = typeof report.context.archivo === "string" ? report.context.archivo.split(" · ")[0] : "";
  if (opened && report.user_id) {
    const { data } = await db
      .from("user_files")
      .select("name, path")
      .eq("user_id", report.user_id)
      .ilike("name", `${opened.replace(/[%_]/g, "\\$&")}.%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      const signed = (await db.storage.from("user-files").createSignedUrl(data.path, 3600, { download: data.name })).data?.signedUrl;
      if (signed) file = { name: data.name, url: signed };
    }
  }
  return { screenshot, file };
}

export default async function ReportsPage({ searchParams }: PageProps<"/reportes">) {
  const requested = String((await searchParams).estado ?? "new");
  const status = requested in STATUSES ? requested : requested === "todos" ? "" : "new";

  let request = admin().from("bug_reports").select("*").order("created_at", { ascending: false }).limit(100);
  if (status) request = request.eq("status", status);
  const reports = must(await request) as Report[];
  const extras = await Promise.all(reports.map(attachments));

  const tab = "rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-raised aria-[current=true]:bg-raised aria-[current=true]:text-white";

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>Reportes de problemas</h1>
        <nav className="flex flex-wrap gap-1" aria-label="Estado">
          {Object.entries(STATUSES).map(([value, label]) => (
            <Link key={value} href={`/reportes?estado=${value}`} aria-current={value === status} className={tab}>
              {label}
            </Link>
          ))}
          <Link href="/reportes?estado=todos" aria-current={!status} className={tab}>
            Todos
          </Link>
        </nav>
      </header>

      {reports.length === 0 && <p className="card text-muted">No hay reportes{status ? " en este estado" : " todavía"}.</p>}

      {reports.map((report, index) => {
        const { screenshot, file } = extras[index];
        const context = Object.entries(report.context ?? {}).filter(([, value]) => value !== null && value !== "");
        return (
          <article key={report.id} className="card grid gap-4 lg:grid-cols-[1fr_16rem]">
            <div className="flex min-w-0 flex-col gap-3 text-sm">
              <div>
                <h2>
                  #{report.number} · {APPS[report.app] ?? report.app}
                  {report.page && <span className="font-normal text-muted"> · {report.page}</span>}
                </h2>
                <p className="text-xs text-muted">
                  {dateTime(report.created_at)} · {report.email ? <a href={`mailto:${report.email}?subject=Tu reporte %23${report.number} en Kubbo3D`}>{report.email}</a> : "sin correo"}
                </p>
              </div>
              <p className="whitespace-pre-line">{report.message}</p>
              {(screenshot || file) && (
                <div className="flex flex-wrap items-start gap-3">
                  {screenshot && (
                    <a href={screenshot} target="_blank" rel="noreferrer" title="Abrir la captura">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL that expires, not worth optimizing */}
                      <img src={screenshot} alt={`Captura del reporte #${report.number}`} className="max-h-48 rounded-lg border border-line" />
                    </a>
                  )}
                  {file && (
                    <a href={file.url} className="btn">
                      Descargar su archivo: {file.name}
                    </a>
                  )}
                </div>
              )}
              {context.length > 0 && (
                <details className="rounded-lg border border-line p-2 text-xs">
                  <summary className="cursor-pointer text-muted">Contexto: lo que estaba haciendo</summary>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {context.map(([key, value]) => (
                      <div key={key} className="contents">
                        <dt className="font-semibold text-muted">{key.replace(/_/g, " ")}</dt>
                        <dd className="break-all whitespace-pre-wrap">{show(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </div>

            <form action={saveBugReport} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={report.id} />
              <label className="label">
                Estado
                <select name="status" defaultValue={report.status} className="input">
                  {Object.entries(STATUSES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label.replace(/s$/, "")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Nota interna
                <textarea name="admin_note" defaultValue={report.admin_note} className="input min-h-20" placeholder="Qué era, cómo se arregló…" />
              </label>
              <button className="btn">Guardar</button>
            </form>
          </article>
        );
      })}
      {reports.length === 100 && <p className="text-xs text-muted">Se muestran los 100 reportes más recientes.</p>}
    </>
  );
}
