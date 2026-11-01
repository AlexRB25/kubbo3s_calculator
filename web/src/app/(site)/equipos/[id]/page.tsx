import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Gallery } from "@/components/Gallery";
import { ListingPrice } from "@/components/classifieds/parts";
import { CONDITIONS, EQUIPMENT_CATEGORIES, equipmentImage, labelOf, placeOf, showWhatsapp, whatsappLink, type Listing } from "@/lib/classifieds";
import { day } from "@/lib/format";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Without a session only active listings come back.
const findListing = cache(async (id: string): Promise<Listing | null> => {
  if (!supabaseConfigured || !UUID.test(id)) return null;
  const { data } = await publicClient().from("equipment_listings").select("*").eq("id", id).maybeSingle();
  return data as Listing | null;
});

export async function generateMetadata({ params }: PageProps<"/equipos/[id]">): Promise<Metadata> {
  const listing = await findListing((await params).id);
  if (!listing) return { title: "Anuncio no encontrado" };
  return {
    title: `${listing.title} · en venta`,
    description: (listing.description || `${labelOf(EQUIPMENT_CATEGORIES, listing.category)} en venta en Kubbo3D.`).slice(0, 160),
    openGraph: listing.images[0] ? { images: [equipmentImage(listing.images[0])!] } : undefined,
  };
}

export default async function ListingPage({ params }: PageProps<"/equipos/[id]">) {
  const listing = await findListing((await params).id);
  if (!listing) notFound();
  const facts: [string, string][] = [
    ["Tipo", labelOf(EQUIPMENT_CATEGORIES, listing.category)],
    ["Marca", listing.brand],
    ["Modelo", listing.model],
    ["Estado", labelOf(CONDITIONS, listing.condition)],
    ["Ubicación", placeOf(listing)],
    ["Publicado", day(listing.created_at)],
  ];
  const message = `Hola, vi tu anuncio «${listing.title}» en Kubbo3D. ¿Sigue disponible?`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/equipos" className="text-sm text-muted hover:text-white">
        ← Equipos en venta
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <Gallery images={listing.images.map((path) => equipmentImage(path)!)} name={listing.title} />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-brand">{labelOf(EQUIPMENT_CATEGORIES, listing.category)}</p>
            <h1 className="text-3xl">{listing.title}</h1>
            <ListingPrice price={Number(listing.price)} currency={listing.currency} className="text-3xl font-bold" />
          </div>

          <div className={`rounded-lg border p-3 text-sm ${listing.free_shipping ? "border-brand bg-brand/10" : "border-line"}`}>
            <p className="font-semibold">{listing.free_shipping ? "Incluye envío gratis" : "No incluye envío gratis"}</p>
            {listing.shipping_note && <p className="text-muted">{listing.shipping_note}</p>}
          </div>

          {listing.status === "active" ? (
            <a href={whatsappLink(listing.whatsapp, message)} target="_blank" rel="noopener noreferrer" className="btn btn-primary justify-center py-3 text-base">
              Contactar por WhatsApp
            </a>
          ) : (
            <p className="card text-muted">{listing.status === "sold" ? "Este equipo ya se vendió." : "Este anuncio está en pausa."}</p>
          )}
          <p className="-mt-3 text-xs text-muted">WhatsApp del vendedor: {showWhatsapp(listing.whatsapp)}</p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>

          {listing.description && (
            <section className="flex flex-col gap-1">
              <h2 className="text-lg">Descripción</h2>
              <p className="whitespace-pre-line text-sm text-muted">{listing.description}</p>
            </section>
          )}
          {listing.includes && (
            <section className="flex flex-col gap-1">
              <h2 className="text-lg">Qué incluye</h2>
              <p className="whitespace-pre-line text-sm text-muted">{listing.includes}</p>
            </section>
          )}

          <p className="rounded-lg border border-line p-3 text-xs text-muted">
            Kubbo3D no vende este equipo ni participa en el pago. Antes de pagar, pide fotos o video funcionando, revisa en persona si puedes y desconfía de precios demasiado
            bajos o de quien pida anticipos sin dar datos.
          </p>
        </div>
      </div>
    </main>
  );
}
