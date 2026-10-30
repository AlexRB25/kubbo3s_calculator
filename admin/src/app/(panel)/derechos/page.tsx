import { resolveClaim } from "@/app/actions";
import { dateTime } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Claim = {
  id: string;
  model_id: string;
  claimant_name: string;
  claimant_email: string;
  claimant_phone: string;
  company: string;
  country: string;
  relationship: "owner" | "agent";
  original_url: string;
  description: string;
  evidence_links: string[];
  evidence_files: string[];
  signature: string;
  status: "new" | "accepted" | "rejected";
  admin_note: string;
  created_at: string;
  resolved_at: string | null;
  models: { title: string; blocked: boolean } | null;
};

const STATUS = { new: "Pendiente", accepted: "Aceptado: modelo retirado", rejected: "Rechazado" };

/**
 * Copyright claims over marketplace models: who claims, how to reach them, the original and the evidence.
 * Accepting one takes the model down; either way the note is kept and the claimant is answered by email.
 */
export default async function ClaimsPage({ searchParams }: PageProps<"/derechos">) {
  const params = await searchParams;
  const showAll = params.ver === "todos";
  const site = (process.env.WEB_URL ?? "").replace(/\/$/, "");
  const db = admin();
  let query = db.from("model_claims").select("*, models(title, blocked)").order("created_at", { ascending: false }).limit(200);
  if (!showAll) query = query.eq("status", "new");
  const claims = must(await query) as unknown as Claim[];
  // Evidence files are private: one-hour links for this visit.
  const links = new Map<string, string>();
  for (const claim of claims) {
    for (const path of claim.evidence_files) {
      const signed = (await db.storage.from("model-claims").createSignedUrl(path, 3600)).data?.signedUrl;
      if (signed) links.set(path, signed);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Reclamos de derechos de autor</h1>
          <p className="text-sm text-muted">Los envían los dueños de un diseño (o sus representantes) desde la página de cada modelo, con o sin cuenta.</p>
        </div>
        <a href={showAll ? "/derechos" : "/derechos?ver=todos"} className="btn">
          {showAll ? "Solo pendientes" : "Ver todos"}
        </a>
      </header>

      {claims.length === 0 && <p className="card text-muted">{showAll ? "Todavía no hay reclamos." : "No hay reclamos pendientes."}</p>}

      {claims.map((claim) => (
        <article key={claim.id} className="card grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-2 text-sm">
            <h2>
              {site ? (
                <a href={`${site}/modelos/${claim.model_id}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand">
                  {claim.models?.title ?? "Modelo borrado"}
                </a>
              ) : (
                (claim.models?.title ?? "Modelo borrado")
              )}
              {claim.models?.blocked && <span className="ml-2 text-xs text-warn">(retirado)</span>}
            </h2>
            <p className="text-xs text-muted">
              {dateTime(claim.created_at)} · {STATUS[claim.status]}
              {claim.resolved_at && ` el ${dateTime(claim.resolved_at)}`}
            </p>
            <p className="whitespace-pre-line">{claim.description}</p>
            {claim.original_url && (
              <p>
                Obra original:{" "}
                <a href={claim.original_url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand">
                  {claim.original_url}
                </a>
              </p>
            )}
            {claim.evidence_links.length > 0 && (
              <div>
                Otros enlaces:
                <ul className="list-inside list-disc">
                  {claim.evidence_links.map((link) => (
                    <li key={link}>
                      <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {claim.evidence_files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {claim.evidence_files.map((path) =>
                  links.has(path) ? (
                    <a key={path} href={links.get(path)} target="_blank" rel="noopener noreferrer" className="btn px-3 py-1 text-xs">
                      📎 {path.split("/").pop()}
                    </a>
                  ) : (
                    <span key={path} className="text-xs text-muted">
                      📎 {path.split("/").pop()} (no se subió)
                    </span>
                  ),
                )}
              </div>
            )}
            {claim.admin_note && <p className="text-xs text-muted">Nota: {claim.admin_note}</p>}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">{claim.claimant_name}</p>
            <p className="text-xs text-muted">
              {claim.relationship === "owner" ? "Autor o dueño de los derechos" : "Representante"}
              {claim.company && ` · ${claim.company}`}
              {claim.country && ` · ${claim.country}`}
            </p>
            <a
              href={`mailto:${claim.claimant_email}?subject=${encodeURIComponent(`Tu reclamo sobre «${claim.models?.title ?? "un modelo"}» en Kubbo3D`)}`}
              className="break-all text-brand"
            >
              {claim.claimant_email}
            </a>
            {claim.claimant_phone && (
              <a href={`https://wa.me/${claim.claimant_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-brand">
                {claim.claimant_phone}
              </a>
            )}
            <p className="text-xs text-muted">Firmó: {claim.signature}</p>

            {claim.status === "new" && (
              <form action={resolveClaim} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="id" value={claim.id} />
                <input type="hidden" name="model_id" value={claim.model_id} />
                <textarea name="note" className="input" rows={2} maxLength={2000} placeholder="Nota (qué revisaste, qué respondiste)" />
                <button name="decision" value="accepted" className="btn btn-primary">
                  Aceptar y retirar el modelo
                </button>
                <button name="decision" value="rejected" className="btn">
                  Rechazar
                </button>
              </form>
            )}
          </div>
        </article>
      ))}
    </>
  );
}
