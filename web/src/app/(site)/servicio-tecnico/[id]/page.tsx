import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { TechReviews } from "@/components/classifieds/TechReviews";
import { TECH_MODES, TECH_SERVICES, equipmentImage, labelOf, placeOf, showWhatsapp, stars, whatsappLink, type TechProvider, type TechReview } from "@/lib/classifieds";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Without a session only active, unblocked technicians come back.
const findProvider = cache(async (id: string): Promise<TechProvider | null> => {
  if (!supabaseConfigured || !UUID.test(id)) return null;
  const { data } = await publicClient().from("tech_providers").select("*").eq("user_id", id).maybeSingle();
  return data as TechProvider | null;
});

export async function generateMetadata({ params }: PageProps<"/servicio-tecnico/[id]">): Promise<Metadata> {
  const provider = await findProvider((await params).id);
  if (!provider) return { title: "Técnico no encontrado" };
  return {
    title: `${provider.name} · servicio técnico 3D`,
    description: (provider.about || `${provider.services.map((value) => labelOf(TECH_SERVICES, value)).join(", ")} de impresoras 3D.`).slice(0, 160),
  };
}

export default async function TechnicianPage({ params }: PageProps<"/servicio-tecnico/[id]">) {
  const provider = await findProvider((await params).id);
  if (!provider) notFound();
  const { data: reviews } = await publicClient().from("tech_reviews").select("*").eq("provider_id", provider.user_id).order("created_at", { ascending: false }).limit(200);
  const photo = equipmentImage(provider.photo_path);
  const message = `Hola ${provider.name}, te encontré en Kubbo3D. Quiero cotizar un servicio para mi impresora 3D.`;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <Link href="/servicio-tecnico" className="text-sm text-muted hover:text-white">
        ← Servicio técnico
      </Link>
      <header className="flex flex-wrap items-center gap-5">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-full bg-raised">
          {/* eslint-disable-next-line @next/next/no-img-element -- avatar from storage */}
          {photo && <img src={photo} alt="" className="size-full object-cover" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-3xl">{provider.name}</h1>
          <p>
            {provider.rating_count > 0 ? (
              <>
                <span className="text-warn">{stars(Number(provider.rating_avg))}</span>{" "}
                <span className="text-muted">
                  {Number(provider.rating_avg).toFixed(1)} de 5 · {provider.rating_count} {provider.rating_count === 1 ? "calificación" : "calificaciones"}
                </span>
              </>
            ) : (
              <span className="text-muted">Todavía sin calificaciones</span>
            )}
          </p>
          {placeOf(provider) && <p className="text-sm text-muted">{placeOf(provider)}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <a href={whatsappLink(provider.whatsapp, message)} target="_blank" rel="noopener noreferrer" className="btn btn-primary justify-center px-6 py-3 text-base">
            Contactar por WhatsApp
          </a>
          <span className="text-center text-xs text-muted">{showWhatsapp(provider.whatsapp)}</span>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card flex flex-col gap-2">
          <h2 className="text-lg">Servicios</h2>
          <ul className="flex flex-wrap gap-2">
            {provider.services.map((value) => (
              <li key={value} className="rounded-full border border-line px-3 py-1 text-sm">
                {labelOf(TECH_SERVICES, value)}
              </li>
            ))}
          </ul>
        </div>
        <div className="card flex flex-col gap-2 text-sm">
          <h2 className="text-lg">Dónde atiende</h2>
          <p>{provider.modes.map((value) => labelOf(TECH_MODES, value)).join(" · ")}</p>
          {provider.brands.length > 0 && (
            <>
              <h2 className="mt-2 text-lg">Marcas</h2>
              <p className="text-muted">{provider.brands.join(", ")}</p>
            </>
          )}
        </div>
      </section>

      {provider.about && (
        <section className="flex flex-col gap-1">
          <h2 className="text-lg">Sobre su servicio</h2>
          <p className="whitespace-pre-line text-sm text-muted">{provider.about}</p>
        </section>
      )}

      <p className="rounded-lg border border-line p-3 text-xs text-muted">
        Kubbo3D no presta el servicio ni participa en el pago: acuerda precio, tiempos y garantía directamente con el técnico. Después, califícalo para ayudar a otros makers.
      </p>

      <TechReviews providerId={provider.user_id} initial={(reviews ?? []) as TechReview[]} />
    </main>
  );
}
