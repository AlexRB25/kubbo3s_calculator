import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Gallery } from "@/components/Gallery";
import { ModelActions } from "@/components/market/ModelActions";
import { ModelComments } from "@/components/market/ModelComments";
import { day, money } from "@/lib/format";
import { categoryLabel, fileSize, makerName, mediaUrl, type Comment, type Maker, type Model } from "@/lib/market";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Found = Model & { makers: Pick<Maker, "handle" | "name" | "bio" | "country"> | null };

// One query shared by generateMetadata and the page. Without a session only published models come back.
const findModel = cache(async (id: string): Promise<Found | null> => {
  if (!supabaseConfigured || !UUID.test(id)) return null;
  const { data } = await publicClient().from("models").select("*, makers(handle, name, bio, country)").eq("id", id).maybeSingle();
  return data as Found | null;
});

export async function generateMetadata({ params }: PageProps<"/modelos/[id]">): Promise<Metadata> {
  const model = await findModel((await params).id);
  if (!model) return { title: "Modelo no encontrado" };
  return {
    title: `${model.title} · STL`,
    description: (model.description || `Modelo 3D de ${makerName(model.makers)} listo para imprimir.`).slice(0, 160),
    openGraph: model.images[0] ? { images: [mediaUrl(model.images[0])] } : undefined,
  };
}

export default async function ModelPage({ params }: PageProps<"/modelos/[id]">) {
  const model = await findModel((await params).id);
  if (!model) notFound();
  const { data: comments } = await publicClient()
    .from("model_comments")
    .select("id, user_id, parent_id, body, created_at, makers(handle, name)")
    .eq("model_id", model.id)
    .order("created_at")
    .limit(300);
  const price = Number(model.price);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/modelos" className="text-sm text-muted hover:text-white">
        ← Modelos 3D
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <Gallery images={model.images.map(mediaUrl)} name={model.title} />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-brand">{categoryLabel(model.category)}</p>
            <h1 className="text-3xl">{model.title}</h1>
            {model.makers && (
              <p className="text-sm text-muted">
                por{" "}
                <Link href={`/modelos/u/${model.makers.handle}`} className="font-medium text-white hover:text-brand">
                  {makerName(model.makers)}
                </Link>
                {model.published_at && ` · ${day(model.published_at)}`}
              </p>
            )}
            <p className="flex flex-wrap gap-x-4 text-sm tabular-nums text-muted">
              <span>{model.rating_count > 0 ? `★ ${Number(model.rating_avg).toFixed(1)} (${model.rating_count})` : "Sin calificaciones"}</span>
              <span>⬇ {model.downloads} descargas</span>
              <span>♥ {model.likes}</span>
            </p>
          </div>

          <strong className="text-3xl tabular-nums">{price > 0 ? money(price) : "Gratis"}</strong>
          <ModelActions modelId={model.id} ownerId={model.user_id} price={price} title={model.title} />

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Licencia</dt>
            <dd>{model.commercial ? "Puedes vender las piezas que imprimas" : "Solo uso personal (no vender las piezas)"}</dd>
            <dt className="text-muted">Archivos</dt>
            <dd>
              {model.files.map((file) => (
                <span key={file.path} className="mr-3 inline-block">
                  {file.name} <span className="text-muted">{fileSize(file.size)}</span>
                </span>
              ))}
            </dd>
          </dl>

          {model.description && <p className="whitespace-pre-line leading-relaxed text-muted">{model.description}</p>}
          {model.print_notes && (
            <div className="card flex flex-col gap-1">
              <h2 className="text-base">Cómo imprimirlo</h2>
              <p className="whitespace-pre-line text-sm text-muted">{model.print_notes}</p>
            </div>
          )}
          {model.tags.length > 0 && (
            <p className="flex flex-wrap gap-2">
              {model.tags.map((tag) => (
                <Link key={tag} href={`/modelos?q=${encodeURIComponent(tag)}`} className="rounded-full bg-raised px-3 py-1 text-xs text-muted hover:text-white">
                  #{tag}
                </Link>
              ))}
            </p>
          )}
        </div>
      </div>

      <ModelComments modelId={model.id} ownerId={model.user_id} initial={(comments ?? []) as unknown as Comment[]} />
    </main>
  );
}
