import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyrightClaimForm } from "@/components/market/CopyrightClaimForm";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = { title: "Reclamo de derechos de autor", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The formal copyright claim over one marketplace model; anyone can send it, with or without an account. */
export default async function ClaimPage({ params }: PageProps<"/modelos/[id]/reclamo">) {
  const { id } = await params;
  const { data: model } = supabaseConfigured && UUID.test(id) ? await publicClient().from("models").select("id, title").eq("id", id).maybeSingle() : { data: null };
  if (!model) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
      <Link href={`/modelos/${model.id}`} className="text-sm text-muted hover:text-white">
        ← {model.title}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">Reclamo de derechos de autor</h1>
        <p className="text-muted">
          Si «{model.title}» copia un diseño tuyo (o de quien representas) sin permiso, cuéntanos y envía tu evidencia. Lo revisamos y, si procede, lo
          retiramos del marketplace y avisamos a quien lo publicó.
        </p>
      </div>
      <CopyrightClaimForm modelId={model.id} title={model.title} />
    </main>
  );
}
