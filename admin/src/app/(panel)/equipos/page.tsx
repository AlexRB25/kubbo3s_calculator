import Link from "next/link";
import { deleteListing, setListingBlocked } from "@/app/actions";
import { cleanUrl, dateTime } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Listing = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  price: number;
  currency: string;
  images: string[];
  city: string;
  state: string;
  whatsapp: string;
  free_shipping: boolean;
  status: string;
  blocked: boolean;
  created_at: string;
};

const STATUS: Record<string, string> = { active: "Publicado", paused: "En pausa", sold: "Vendido" };
const TABS = { todos: "Todos", visibles: "Visibles", ocultos: "Ocultos por admin" } as const;

const photo = (path: string | undefined) => (path ? cleanUrl(`${process.env.PB_SUPABASE_URL}/storage/v1/object/public/equipment/${path}`) : null);

/** Equipment users sell to each other: the admin hides a listing (fraud, stolen, off topic) or deletes it. */
export default async function EquipmentPage({ searchParams }: PageProps<"/equipos">) {
  const requested = String((await searchParams).ver ?? "todos");
  const tab = requested in TABS ? requested : "todos";
  let request = admin().from("equipment_listings").select("*").order("created_at", { ascending: false }).limit(200);
  if (tab === "visibles") request = request.eq("blocked", false);
  if (tab === "ocultos") request = request.eq("blocked", true);
  const listings = must(await request) as Listing[];
  const emails = new Map<string, string>();
  for (const id of [...new Set(listings.map((item) => item.user_id))]) {
    const { data } = await admin().auth.admin.getUserById(id);
    emails.set(id, data.user?.email ?? "");
  }
  const tabClass = "rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-raised aria-[current=true]:bg-raised aria-[current=true]:text-white";
  const site = (process.env.WEB_URL ?? "").replace(/\/$/, "");

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>Equipos de usuarios</h1>
        <nav className="flex flex-wrap gap-1" aria-label="Filtro">
          {Object.entries(TABS).map(([value, label]) => (
            <Link key={value} href={`/equipos?ver=${value}`} aria-current={value === tab} className={tabClass}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {listings.length === 0 && <p className="card text-muted">No hay anuncios.</p>}
      {listings.map((listing) => {
        const cover = photo(listing.images[0]);
        return (
          <article key={listing.id} className="card flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail */}
            {cover ? <img src={cover} alt="" className="size-20 rounded-lg object-cover" /> : <div className="size-20 rounded-lg bg-raised" />}
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <p className="font-semibold">
                {site ? (
                  <a href={`${site}/equipos/${listing.id}`} target="_blank" rel="noreferrer">
                    {listing.title}
                  </a>
                ) : (
                  listing.title
                )}
              </p>
              <p>
                {Number(listing.price).toLocaleString("es-MX")} {listing.currency} · {STATUS[listing.status] ?? listing.status}
                {listing.free_shipping && " · envío gratis"}
                {listing.blocked && <span className="ml-2 rounded bg-bad/20 px-1.5 text-xs text-bad">Oculto</span>}
              </p>
              <p className="text-xs text-muted">
                {emails.get(listing.user_id) || listing.user_id} · WhatsApp {listing.whatsapp} · {[listing.city, listing.state].filter(Boolean).join(", ")} · {dateTime(listing.created_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={setListingBlocked}>
                <input type="hidden" name="id" value={listing.id} />
                <input type="hidden" name="blocked" value={String(!listing.blocked)} />
                <button className="btn">{listing.blocked ? "Volver a mostrar" : "Ocultar"}</button>
              </form>
              <form action={deleteListing}>
                <input type="hidden" name="id" value={listing.id} />
                <button className="btn btn-danger">Borrar</button>
              </form>
            </div>
          </article>
        );
      })}
      {listings.length === 200 && <p className="text-xs text-muted">Se muestran los 200 más recientes.</p>}
    </>
  );
}
