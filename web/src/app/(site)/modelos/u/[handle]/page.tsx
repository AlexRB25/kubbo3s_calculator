import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ModelCardView } from "@/components/ModelCardView";
import { CARD_COLUMNS, makerName, type Maker, type ModelCard } from "@/lib/market";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

const findMaker = cache(async (handle: string): Promise<Maker | null> => {
  if (!supabaseConfigured || !/^[a-z0-9_]{3,30}$/.test(handle)) return null;
  const { data } = await publicClient().from("makers").select("*").eq("handle", handle).maybeSingle();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/modelos/u/[handle]">): Promise<Metadata> {
  const maker = await findMaker((await params).handle);
  if (!maker) return { title: "Perfil no encontrado" };
  return { title: `${makerName(maker)} · Modelos 3D`, description: maker.bio.slice(0, 160) || `Modelos 3D de ${makerName(maker)} en Kubbo3D.` };
}

export default async function MakerPage({ params }: PageProps<"/modelos/u/[handle]">) {
  const maker = await findMaker((await params).handle);
  if (!maker) notFound();
  const { data } = await publicClient()
    .from("models")
    .select(CARD_COLUMNS)
    .eq("user_id", maker.user_id)
    .eq("status", "published")
    .eq("blocked", false)
    .order("published_at", { ascending: false })
    .limit(200);
  const models = (data ?? []) as unknown as ModelCard[];
  const downloads = models.reduce((total, model) => total + model.downloads, 0);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <Link href="/modelos" className="text-sm text-muted hover:text-white">
        ← Modelos 3D
      </Link>
      <header className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand/15 text-2xl font-black text-brand">
          {makerName(maker).replace("@", "").charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl">{makerName(maker)}</h1>
          <p className="text-sm text-muted">
            @{maker.handle}
            {maker.country && ` · ${maker.country}`} · {models.length} modelo{models.length === 1 ? "" : "s"} · {downloads} descargas
          </p>
        </div>
      </header>
      {maker.bio && <p className="max-w-2xl whitespace-pre-line text-muted">{maker.bio}</p>}
      {models.length === 0 ? (
        <p className="card text-center text-muted">Todavía no publica modelos.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {models.map((model) => (
            <ModelCardView key={model.id} model={model} />
          ))}
        </div>
      )}
    </main>
  );
}
