import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ListingPrice } from "@/components/classifieds/parts";
import { CONDITIONS, EQUIPMENT_CATEGORIES, equipmentImage, labelOf, placeOf, type Listing } from "@/lib/classifieds";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Equipos de impresión 3D en venta",
  description: "Impresoras 3D, AMS, resina, láser y refacciones que venden otros makers. Contacta al vendedor por WhatsApp.",
};

const PAGE = 48;

export default async function EquipmentPage({ searchParams }: PageProps<"/equipos">) {
  const params = await searchParams;
  const category = EQUIPMENT_CATEGORIES.some((item) => item.value === params.categoria) ? String(params.categoria) : "";
  const freeShipping = params.envio === "gratis";
  const query = String(params.q ?? "").trim();
  const page = Math.max(1, Number(params.pagina) || 1);

  let listings: Listing[] = [];
  let failed = !supabaseConfigured;
  if (supabaseConfigured) {
    let request = publicClient().from("equipment_listings").select("*").eq("status", "active").eq("blocked", false);
    if (category) request = request.eq("category", category);
    if (freeShipping) request = request.eq("free_shipping", true);
    // Only characters that can appear in a title, so the filter cannot be broken out of.
    const safe = query.replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 60);
    if (safe) request = request.or(`title.ilike.%${safe}%,brand.ilike.%${safe}%,model.ilike.%${safe}%,city.ilike.%${safe}%,state.ilike.%${safe}%`);
    const result = await request.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE);
    listings = (result.data ?? []) as Listing[];
    failed = Boolean(result.error);
  }
  const more = listings.length > PAGE;
  if (more) listings = listings.slice(0, PAGE);

  const link = (change: Record<string, string>) => {
    const next = new URLSearchParams({ ...(category && { categoria: category }), ...(freeShipping && { envio: "gratis" }), ...(query && { q: query }) });
    for (const [key, value] of Object.entries(change)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const text = next.toString();
    return text ? `/equipos?${text}` : "/equipos";
  };
  const chip =
    "whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-white aria-[current=true]:border-brand aria-[current=true]:bg-brand/15 aria-[current=true]:text-white";

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Equipos en venta</h1>
          <p className="mt-1 max-w-xl text-muted">Impresoras, AMS, resina, láser y refacciones que venden otros makers. Contacta al vendedor por WhatsApp y acuerden el trato.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/equipos/mis" className="btn">
            Mis anuncios
          </Link>
          <Link href="/equipos/publicar" className="btn btn-primary">
            Vender mi equipo
          </Link>
        </div>
      </header>

      <form className="flex flex-wrap gap-2">
        {category && <input type="hidden" name="categoria" value={category} />}
        {freeShipping && <input type="hidden" name="envio" value="gratis" />}
        <input name="q" defaultValue={query} placeholder="Buscar: A1 mini, K1, Elegoo, Monterrey…" aria-label="Buscar equipo" className="input min-w-0 flex-1" />
        <button className="btn">Buscar</button>
      </form>

      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Tipo de equipo">
        <Link href={link({ categoria: "", pagina: "" })} aria-current={!category} className={chip}>
          Todos
        </Link>
        {EQUIPMENT_CATEGORIES.map((item) => (
          <Link key={item.value} href={link({ categoria: item.value, pagina: "" })} aria-current={category === item.value} className={chip}>
            {item.label}
          </Link>
        ))}
        <Link href={link({ envio: freeShipping ? "" : "gratis", pagina: "" })} aria-current={freeShipping} className={chip}>
          Envío gratis
        </Link>
      </nav>

      {failed && <p className="card text-muted">No pudimos cargar los anuncios. Intenta de nuevo en un momento.</p>}
      {!failed && listings.length === 0 && (
        <p className="card text-muted">{query || category || freeShipping ? "No hay anuncios con esos filtros." : "Todavía no hay equipos en venta. ¡Publica el primero!"}</p>
      )}

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {listings.map((listing) => {
          const cover = equipmentImage(listing.images[0]);
          return (
            <li key={listing.id}>
              <Link href={`/equipos/${listing.id}`} className="card flex h-full flex-col gap-2 p-3 hover:border-brand">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-raised">
                  {cover && <Image src={cover} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />}
                  {listing.free_shipping && <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-ink">Envío gratis</span>}
                </div>
                <p className="line-clamp-2 text-sm font-medium">{listing.title}</p>
                <ListingPrice price={Number(listing.price)} currency={listing.currency} className="text-lg font-bold" />
                <p className="mt-auto text-xs text-muted">
                  {labelOf(CONDITIONS, listing.condition)}
                  {placeOf(listing) && ` · ${placeOf(listing)}`}
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
              Más anuncios →
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
