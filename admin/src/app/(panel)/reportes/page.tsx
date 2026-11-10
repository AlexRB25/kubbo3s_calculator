import Link from "next/link";
import { replyBugReport, saveBugReport } from "@/app/actions";
import { emailConfigured } from "@/lib/email";
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

type Message = {
  id: string;
  report_id: string;
  from_admin: boolean;
  body: string;
  read_at: string | null;
  created_at: string;
  emailed_at?: string | null;
  email_error?: string | null;
};

type Activity = {
  lastSignIn: string | null;
  lastDay: string | null;
  days: number;
  runs: number;
  runsAfterReport: number;
  runsAfterAnswer: number | null;
  lastRun: string | null;
  tools: string[];
};

/** What the person did around the report: last visit, uses before and after it, and after our answer. */
async function activity(report: Report, messages: Message[]): Promise<Activity | null> {
  if (!report.user_id) return null;
  const db = admin();
  const lastAnswer = messages.filter((message) => message.from_admin).at(-1)?.created_at ?? null;
  const [user, days, runs] = await Promise.all([
    db.auth.admin.getUserById(report.user_id),
    db.from("activity_days").select("day").eq("user_id", report.user_id).order("day", { ascending: false }),
    db.from("tool_runs").select("tool, created_at").eq("user_id", report.user_id).order("created_at", { ascending: false }).limit(1000),
  ]);
  const list = (runs.data ?? []) as { tool: string; created_at: string }[];
  return {
    lastSignIn: user.data.user?.last_sign_in_at ?? null,
    lastDay: days.data?.[0]?.day ?? null,
    days: days.data?.length ?? 0,
    runs: list.length,
    runsAfterReport: list.filter((run) => run.created_at > report.created_at).length,
    runsAfterAnswer: lastAnswer ? list.filter((run) => run.created_at > lastAnswer).length : null,
    lastRun: list[0]?.created_at ?? null,
    tools: [...new Set(list.map((run) => run.tool))],
  };
}

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
  const answered = requested === "respuestas";
  const status = requested in STATUSES ? requested : requested === "todos" || answered ? "" : "new";

  // Reports whose sender answered and the administrator has not read it yet.
  const unreadReplies = await admin().from("bug_report_messages").select("report_id").eq("from_admin", false).is("read_at", null);
  const withReply = new Set((unreadReplies.data ?? []).map((row) => row.report_id as string));

  let request = admin().from("bug_reports").select("*").order("created_at", { ascending: false }).limit(100);
  if (status) request = request.eq("status", status);
  if (answered) request = request.in("id", withReply.size ? [...withReply] : ["00000000-0000-0000-0000-000000000000"]);
  const reports = must(await request) as Report[];
  const extras = await Promise.all(reports.map(attachments));
  // The conversation of each report (empty before the messages SQL runs).
  const thread = reports.length
    ? ((await admin().from("bug_report_messages").select("*").in("report_id", reports.map((report) => report.id)).order("created_at")).data ?? [])
    : [];
  const messagesOf = (id: string) => (thread as Message[]).filter((message) => message.report_id === id);
  const activities = await Promise.all(reports.map((report) => activity(report, messagesOf(report.id))));
  const mailReady = emailConfigured();

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
          <Link href="/reportes?estado=respuestas" aria-current={answered} className={tab}>
            Con respuesta{withReply.size > 0 && <span className="ml-1 rounded-full bg-warn px-1.5 text-xs font-bold text-ink">{withReply.size}</span>}
          </Link>
          <Link href="/reportes?estado=todos" aria-current={!status && !answered} className={tab}>
            Todos
          </Link>
        </nav>
      </header>

      {reports.length === 0 && <p className="card text-muted">No hay reportes{status ? " en este estado" : " todavía"}.</p>}

      {reports.map((report, index) => {
        const { screenshot, file } = extras[index];
        const context = Object.entries(report.context ?? {}).filter(([, value]) => value !== null && value !== "");
        const messages = messagesOf(report.id);
        const seen = activities[index];
        const answered = messages.some((message) => message.from_admin);
        const lastAnswer = messages.filter((message) => message.from_admin).at(-1);
        return (
          <article key={report.id} className="card grid gap-4 lg:grid-cols-[1fr_16rem]">
            <div className="flex min-w-0 flex-col gap-3 text-sm">
              <div>
                <h2>
                  #{report.number} · {APPS[report.app] ?? report.app}
                  {withReply.has(report.id) && <span className="ml-2 rounded-full bg-warn px-2 py-0.5 align-middle text-xs font-bold text-ink">Respuesta nueva</span>}
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

              {seen && (
                <section className="flex flex-col gap-1 rounded-lg border border-line p-3 text-xs">
                  <h3 className="text-sm font-semibold">Actividad del usuario</h3>
                  <p>
                    Último ingreso: {seen.lastSignIn ? dateTime(seen.lastSignIn) : "—"} · último día activo: {seen.lastDay ?? "—"} · {seen.days} día{seen.days === 1 ? "" : "s"} activo
                    {seen.days === 1 ? "" : "s"}
                  </p>
                  <p>
                    Usos de herramientas: {seen.runs} en total · {seen.runsAfterReport} después del reporte
                    {seen.lastRun && ` · último: ${dateTime(seen.lastRun)}`}
                    {seen.tools.length > 0 && ` (${seen.tools.join(", ")})`}
                  </p>
                  {answered && (
                    <p className={lastAnswer?.read_at || (seen.runsAfterAnswer ?? 0) > 0 ? "text-money" : "text-bad"}>
                      {lastAnswer?.read_at
                        ? `Leyó tu respuesta${(seen.runsAfterAnswer ?? 0) > 0 ? ` y usó las herramientas ${seen.runsAfterAnswer} ${seen.runsAfterAnswer === 1 ? "vez" : "veces"} desde entonces` : ", pero no ha vuelto a usar las herramientas"}.`
                        : (seen.runsAfterAnswer ?? 0) > 0
                          ? `Volvió a usar las herramientas (${seen.runsAfterAnswer}) pero no ha abierto tu respuesta.`
                          : "No ha vuelto desde tu respuesta."}
                    </p>
                  )}
                </section>
              )}

              <section className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <h3 className="text-sm font-semibold">Conversación con el usuario</h3>
                {messages.length === 0 && <p className="text-xs text-muted">Sin mensajes. Lo que escribas aquí le aparece en «Mis reportes» con un aviso arriba de la página.</p>}
                {messages.map((message) => (
                  <div key={message.id} className={`max-w-[90%] rounded-lg p-2 ${message.from_admin ? "self-end bg-raised" : "self-start border border-warn/50"}`}>
                    <p className="text-xs text-muted">
                      {message.from_admin ? "Tú (admin)" : "Usuario"} · {dateTime(message.created_at)}
                      {message.from_admin && (message.read_at ? ` · leído el ${dateTime(message.read_at)}` : " · sin leer")}
                      {message.from_admin && message.emailed_at && " · correo enviado"}
                      {message.from_admin && message.email_error && <span className="text-bad"> · el correo falló: {message.email_error}</span>}
                    </p>
                    <p className="whitespace-pre-line">{message.body}</p>
                  </div>
                ))}
                {report.user_id ? (
                  <form action={replyBugReport} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={report.id} />
                    <textarea name="body" required maxLength={5000} className="input min-h-20" placeholder="Hola, ¿nos puedes mandar el archivo o contarnos en qué paso falló?" />
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="notify" defaultChecked={mailReady && !!report.email} disabled={!mailReady || !report.email} />
                      {!report.email
                        ? "Sin correo: solo lo verá en Mis reportes"
                        : mailReady
                          ? `Avisarle por correo a ${report.email}`
                          : "Avisarle por correo (falta RESEND_API_KEY en Vercel)"}
                    </label>
                    <button className="btn btn-primary self-start">Enviar mensaje</button>
                  </form>
                ) : (
                  <p className="text-xs text-muted">Ese usuario borró su cuenta: no se le puede escribir.</p>
                )}
              </section>
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
