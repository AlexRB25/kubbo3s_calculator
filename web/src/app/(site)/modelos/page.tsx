import type { Metadata } from "next";
import Link from "next/link";
import { ModelCardView } from "@/components/ModelCardView";
import { CARD_COLUMNS, CATEGORIES, SORTS, type ModelCard } from "@/lib/market";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Modelos 3D",
  description: "Descarga y compra modelos STL y 3MF de makers de México y Latinoamérica, o vende los tuyos.",
};

const PAGE = 48;

export default async function ModelsPage({ searchParams }: PageProps<"/modelos">) {
  const params = await searchParams;
  const category = String(params.categoria ?? "");
  const price = String(params.precio ?? "");
  const sort = SORTS.some((item) => item.value === params.orden) ? String(params.orden) : "recientes";
  const query = String(params.q ?? "").trim();
  const page = Math.max(1, Number(params.pagina) || 1);

  let models: ModelCard[] = [];
  let failed = !supabaseConfigured;
  if (supabaseConfigured) {
    let request = publicClient().from("models").select(CARD_COLUMNS).eq("status", "published").eq("blocked", false);
    if (CATEGORIES.some((item) => item.value === category)) request = request.eq("category", category);
    if (price === "gratis") request = request.eq("price", 0);
    if (price === "pago") request = request.gt("price", 0);
    // Only characters that can appear in a title or tag, so the filter cannot be broken out of.
    const safe = query.replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 60);
    if (safe) request = request.or(`title.ilike.%${safe}%,tags.cs.{${safe.toLowerCase()}}`);
    request =
      sort === "populares"
        ? request.order("downloads", { ascending: false })
        : sort === "calificados"
          ? request.order("rating_avg", { ascending: false }).order("rating_count", { ascending: false })
          : sort === "favoritos"
            ? request.order("likes", { ascending: false })
            : request;
    const result = await request.order("published_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE);
    models = (result.data ?? []) as unknown as ModelCard[];
    failed = Boolean(result.error);
  }
  const more = models.length > PAGE;
  if (more) models = models.slice(0, PAGE);

  const link = (change: Record<string, string>) => {
    const next = new URLSearchParams({ ...(category && { categoria: category }), ...(price && { precio: price }), ...(sort !== "recientes" && { orden: sort }), ...(query && { q: query }) });
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const text = next.toString();
    return text ? `/modelos?${text}` : "/modelos";
  };
  const chip =
    "whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-white aria-[current=true]:border-brand aria-[current=true]:bg-brand/15 aria-[current=true]:text-white";

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Modelos 3D</h1>
          <p className="mt-1 max-w-xl text-muted">STL y 3MF listos para imprimir, gratis y de pago. ¿Diseñas? Sube los tuyos y cobra por cada descarga.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/modelos/biblioteca" className="btn">
            Mi biblioteca
          </Link>
          <Link href="/modelos/panel" className="btn btn-primary">
            Vender mis modelos
          </Link>
        </div>
      </header>

      <form className="flex flex-wrap gap-2">
        {category && <input type="hidden" name="categoria" value={category} />}
        {price && <input type="hidden" name="precio" value={price} />}
        {sort !== "recientes" && <input type="hidden" name="orden" value={sort} />}
        <input name="q" defaultValue={query} placeholder="Buscar: maceta, llavero, Pikachu…" aria-label="Buscar modelo" className="input min-w-0 flex-1" />
        <button className="btn">Buscar</button>
      </form>

      <div className="flex flex-col gap-3">
        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Categorías">
          <Link href={link({ categoria: "", pagina: "" })} aria-current={!category} className={chip}>
            Todo
          </Link>
          {CATEGORIES.map((item) => (
            <Link key={item.value} href={link({ categoria: item.value, pagina: "" })} aria-current={item.value === category} className={chip}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            ["", "Gratis y de pago"],
            ["gratis", "Gratis"],
            ["pago", "De pago"],
          ].map(([value, label]) => (
            <Link key={value} href={link({ precio: value, pagina: "" })} aria-current={value === price} className={chip}>
              {label}
            </Link>
          ))}
          <span className="mx-1 text-line">|</span>
          {SORTS.map((item) => (
            <Link key={item.value} href={link({ orden: item.value === "recientes" ? "" : item.value, pagina: "" })} aria-current={item.value === sort} className={chip}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {failed ? (
        <p className="error">No pudimos cargar los modelos. Inténtalo de nuevo en un momento.</p>
      ) : models.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 text-center text-muted">
          <p>{query || category || price ? "No hay modelos con ese filtro." : "Todavía no hay modelos publicados. ¡Sé el primero!"}</p>
          <Link href="/modelos/panel" className="btn btn-primary">
            Subir un modelo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {models.map((model) => (
            <ModelCardView key={model.id} model={model} />
          ))}
        </div>
      )}

      {(page > 1 || more) && (
        <nav className="flex justify-center gap-2" aria-label="Páginas">
          {page > 1 && (
            <Link href={link({ pagina: page > 2 ? String(page - 1) : "" })} className="btn">
              ← Anterior
            </Link>
          )}
          {more && (
            <Link href={link({ pagina: String(page + 1) })} className="btn">
              Siguiente →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
