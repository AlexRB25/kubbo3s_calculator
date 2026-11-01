import type { Metadata } from "next";
import Link from "next/link";
import { TECH_MODES, TECH_SERVICES, equipmentImage, labelOf, placeOf, stars, type TechProvider } from "@/lib/classifieds";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Servicio técnico de impresoras 3D",
  description: "Técnicos que reparan, calibran y dan mantenimiento a impresoras 3D, con calificaciones de otros makers. Contáctalos por WhatsApp.",
};

const PAGE = 48;

export default async function TechniciansPage({ searchParams }: PageProps<"/servicio-tecnico">) {
  const params = await searchParams;
  const service = TECH_SERVICES.some((item) => item.value === params.servicio) ? String(params.servicio) : "";
  const query = String(params.q ?? "").trim();
  const page = Math.max(1, Number(params.pagina) || 1);

  let providers: TechProvider[] = [];
  let failed = !supabaseConfigured;
  if (supabaseConfigured) {
    let request = publicClient().from("tech_providers").select("*").eq("active", true).eq("blocked", false);
    if (service) request = request.contains("services", [service]);
    // Only characters that can appear in a name or place, so the filter cannot be broken out of.
    const safe = query.replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 60);
    if (safe) request = request.or(`name.ilike.%${safe}%,city.ilike.%${safe}%,state.ilike.%${safe}%,country.ilike.%${safe}%`);
    const result = await request
      .order("rating_avg", { ascending: false })
      .order("rating_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE, page * PAGE);
    providers = (result.data ?? []) as TechProvider[];
    failed = Boolean(result.error);
  }
  const more = providers.length > PAGE;
  if (more) providers = providers.slice(0, PAGE);

  const link = (change: Record<string, string>) => {
    const next = new URLSearchParams({ ...(service && { servicio: service }), ...(query && { q: query }) });
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const text = next.toString();
    return text ? `/servicio-tecnico?${text}` : "/servicio-tecnico";
  };
  const chip =
    "whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-white aria-[current=true]:border-brand aria-[current=true]:bg-brand/15 aria-[current=true]:text-white";

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Servicio técnico</h1>
          <p className="mt-1 max-w-xl text-muted">Técnicos que reparan, revisan y calibran impresoras 3D, calificados por otros makers. ¿Eres técnico? Date de alta gratis.</p>
        </div>
        <Link href="/servicio-tecnico/mi-perfil" className="btn btn-primary">
          Ofrecer mis servicios
        </Link>
      </header>

      <form className="flex flex-wrap gap-2">
        {service && <input type="hidden" name="servicio" value={service} />}
        <input name="q" defaultValue={query} placeholder="Buscar por nombre o ciudad: Guadalajara, Bogotá…" aria-label="Buscar técnico" className="input min-w-0 flex-1" />
        <button className="btn">Buscar</button>
      </form>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Servicio">
        <Link href={link({ servicio: "", pagina: "" })} aria-current={!service} className={chip}>
          Todos
        </Link>
        {TECH_SERVICES.map((item) => (
          <Link key={item.value} href={link({ servicio: item.value, pagina: "" })} aria-current={service === item.value} className={chip}>
            {item.label}
          </Link>
        ))}
      </nav>

      {failed && <p className="card text-muted">No pudimos cargar los técnicos. Intenta de nuevo en un momento.</p>}
      {!failed && providers.length === 0 && (
        <p className="card text-muted">{query || service ? "No hay técnicos con esos filtros." : "Todavía no hay técnicos dados de alta. ¡Sé el primero!"}</p>
      )}

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const photo = equipmentImage(provider.photo_path);
          return (
            <li key={provider.user_id}>
              <Link href={`/servicio-tecnico/${provider.user_id}`} className="card flex h-full flex-col gap-3 hover:border-brand">
                <div className="flex items-center gap-3">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-raised">
                    {/* eslint-disable-next-line @next/next/no-img-element -- small avatar from storage */}
                    {photo && <img src={photo} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{provider.name}</p>
                    <p className="text-sm">
                      {provider.rating_count > 0 ? (
                        <>
                          <span className="text-warn">{stars(Number(provider.rating_avg))}</span>{" "}
                          <span className="text-muted">
                            {Number(provider.rating_avg).toFixed(1)} ({provider.rating_count})
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">Sin calificaciones</span>
                      )}
                    </p>
                  </div>
                </div>
                <p className="line-clamp-2 text-sm text-muted">{provider.services.map((value) => labelOf(TECH_SERVICES, value)).join(" · ")}</p>
                <p className="mt-auto text-xs text-muted">
                  {[placeOf(provider), provider.modes.map((value) => labelOf(TECH_MODES, value)).join(", ")].filter(Boolean).join(" · ")}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      {(page > 1 || more) && (
        <nav className="flex justify-center gap-2" aria-label="Páginas">
          {page > 1 && (
            <Link href={link({ pagina: page > 2 ? String(page - 1) : "" })} className="btn">
              ← Anteriores
            </Link>
          )}
          {more && (
            <Link href={link({ pagina: String(page + 1) })} className="btn">
              Más técnicos →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
