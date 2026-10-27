"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { REPORT_REASONS, type ModelFile } from "@/lib/market";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

type Props = { modelId: string; ownerId: string; price: number; title: string };
export type Signed = { name: string; url: string };

/** Registers the download and signs each file of the model (links last 10 minutes and keep the original name). */
export async function downloadLinks(modelId: string): Promise<Signed[]> {
  const { data, error } = await supabase().rpc("download_model", { p_model: modelId });
  if (error) throw new Error(error.message);
  return Promise.all(
    ((data ?? []) as ModelFile[]).map(async (file) => {
      const result = await supabase().storage.from("model-files").createSignedUrl(file.path, 600, { download: file.name });
      if (result.error) throw new Error(`No pudimos preparar ${file.name}.`);
      return { name: file.name, url: result.data.signedUrl };
    }),
  );
}

/** Asks the server for the Mercado Pago checkout of a model purchase and sends the buyer there. */
async function checkout(purchaseId: string) {
  const { data } = await supabase().auth.getSession();
  const response = await fetch("/api/modelos/pagar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ purchase_id: purchaseId }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.url) throw new Error(body?.error ?? "No pudimos abrir el pago.");
  window.location.assign(body.url);
}

/** Buy / download, favourite, rating and report for one model. What it shows depends on the visitor's session. */
export function ModelActions({ modelId, ownerId, price, title }: Props) {
  const { session, loading } = useSession();
  const userId = session?.user.id;
  const mine = userId === ownerId;
  const [access, setAccess] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [stars, setStars] = useState(0);
  const [links, setLinks] = useState<Signed[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    const db = supabase();
    Promise.all([
      db.rpc("has_model_access", { p_model: modelId }),
      db.from("model_favorites").select("model_id").eq("model_id", modelId).maybeSingle(),
      db.from("model_ratings").select("stars").eq("model_id", modelId).maybeSingle(),
    ]).then(([allowed, saved, rated]) => {
      setAccess(Boolean(allowed.data));
      setFavorite(Boolean(saved.data));
      setStars(rated.data?.stars ?? 0);
    });
  }, [userId, modelId]);

  async function download() {
    setBusy(true);
    setError("");
    try {
      const signed = await downloadLinks(modelId);
      setLinks(signed);
      setAccess(true);
      if (signed.length === 1) window.location.assign(signed[0].url);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function buy() {
    setBusy(true);
    setError("");
    try {
      const { data, error: failed } = await supabase().rpc("buy_model", { p_model: modelId });
      if (failed) throw new Error(failed.message);
      if (data?.already) {
        setAccess(true);
        setBusy(false);
        return;
      }
      await checkout(data.id);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    const db = supabase().from("model_favorites");
    const { error: failed } = next ? await db.insert({ model_id: modelId }) : await db.delete().eq("model_id", modelId);
    if (failed) setFavorite(!next);
  }

  async function rate(value: number) {
    const before = stars;
    setStars(value);
    // Only the stars can change (the database allows no upsert): update the rating or create it.
    const ratings = supabase().from("model_ratings");
    const { error: failed } = before ? await ratings.update({ stars: value }).eq("model_id", modelId) : await ratings.insert({ model_id: modelId, stars: value });
    if (failed) {
      setStars(before);
      setError("No se guardó tu calificación.");
    }
  }

  if (loading) return <div className="h-12" />;
  if (!session) {
    const here = `/entrar?next=${encodeURIComponent(`/modelos/${modelId}`)}`;
    return (
      <div className="flex flex-col gap-2">
        <Link href={here} className="btn btn-primary btn-lg self-start">
          {price > 0 ? "Entrar para comprar" : "Entrar para descargar gratis"}
        </Link>
        <p className="text-xs text-muted">Necesitas una cuenta de Kubbo3D (gratis) para descargar, guardar y comentar.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {access || mine ? (
          <button className="btn btn-primary btn-lg" onClick={download} disabled={busy}>
            {busy ? "Preparando…" : "Descargar archivos"}
          </button>
        ) : price > 0 ? (
          <button className="btn btn-primary btn-lg" onClick={buy} disabled={busy}>
            {busy ? "Abriendo Mercado Pago…" : "Comprar con Mercado Pago"}
          </button>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={download} disabled={busy}>
            {busy ? "Preparando…" : "Descargar gratis"}
          </button>
        )}
        {!mine && (
          <button className="btn btn-lg" onClick={toggleFavorite} aria-pressed={favorite}>
            <span className={favorite ? "text-bad" : ""}>{favorite ? "♥" : "♡"}</span> {favorite ? "Guardado" : "Guardar"}
          </button>
        )}
        {mine && (
          <Link href={`/modelos/panel/editar?id=${modelId}`} className="btn btn-lg">
            Editar
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {links.length > 1 && (
        <ul className="card flex flex-col gap-1 text-sm">
          {links.map((link) => (
            <li key={link.url}>
              <a href={link.url} className="text-brand hover:underline">
                ⬇ {link.name}
              </a>
            </li>
          ))}
        </ul>
      )}
      {access && !mine && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Tu calificación:</span>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} estrella${value === 1 ? "" : "s"}`}
              aria-pressed={value <= stars}
              onClick={() => rate(value)}
              className={`text-2xl leading-none ${value <= stars ? "text-warn" : "text-line hover:text-muted"}`}
            >
              ★
            </button>
          ))}
        </div>
      )}
      {price > 0 && !access && !mine && <p className="text-xs text-muted">Pago único: lo descargas cuando quieras desde Mi biblioteca.</p>}
      {!mine && <Report modelId={modelId} title={title} />}
    </div>
  );
}

function Report({ modelId, title }: { modelId: string; title: string }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");

  async function send(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase().from("model_reports").insert({ model_id: modelId, reason, details: details.trim() });
    // A second open report from the same person is a duplicate: treat it as sent.
    setState(!error || error.code === "23505" ? "sent" : "error");
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted hover:text-white">Denunciar este modelo</summary>
      {state === "sent" ? (
        <p className="mt-2 text-brand">Gracias: revisaremos «{title}».</p>
      ) : (
        <form onSubmit={send} className="mt-2 flex flex-col gap-2">
          <select className="input" value={reason} onChange={(event) => setReason(event.target.value)} aria-label="Motivo">
            {REPORT_REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <textarea className="input" rows={3} maxLength={2000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Cuéntanos más (enlace al original, qué falla…)" />
          <button className="btn self-start">Enviar denuncia</button>
          {state === "error" && <p className="text-bad">No se pudo enviar. Inténtalo otra vez.</p>}
        </form>
      )}
    </details>
  );
}
