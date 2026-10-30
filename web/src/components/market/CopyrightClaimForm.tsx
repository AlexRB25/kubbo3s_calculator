"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

const MAX_FILES = 5;

/**
 * The copyright claim over one model: who claims, how to contact them, where the original is, the evidence
 * (links and files) and two statements signed with their name. Works with or without an account.
 */
export function CopyrightClaimForm({ modelId, title }: { modelId: string; title: string }) {
  const [startedAt] = useState(() => Date.now());
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ email: string; warning?: string } | null>(null);

  function addFiles(list: FileList | null) {
    const picked = [...files, ...Array.from(list ?? [])].slice(0, MAX_FILES);
    const tooBig = picked.find((file) => file.size > 10 * 1024 * 1024);
    if (tooBig) return setError(`«${tooBig.name}» pesa más de 10 MB.`);
    setError("");
    setFiles(picked);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setBusy(true);
    const token = (await supabase().auth.getSession()).data.session?.access_token;
    const response = await fetch("/api/modelos/reclamo", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        ...form,
        model_id: modelId,
        evidence_links: (form.evidence_links ?? "").split(/\s+/).filter(Boolean),
        good_faith: form.good_faith === "on",
        accurate: form.accurate === "on",
        files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
        started_at: startedAt,
      }),
    }).catch(() => null);
    const answer = await response?.json().catch(() => null);
    if (!response?.ok || !answer?.ok) {
      setBusy(false);
      return setError(answer?.error ?? "No se pudo enviar. Revisa tu conexión e intenta de nuevo.");
    }

    // Evidence goes straight to the private bucket with the one-time links the server gave.
    let warning: string | undefined = answer.warning;
    const uploads = (answer.uploads ?? []) as { path: string; token: string }[];
    for (const [index, upload] of uploads.entries()) {
      const { error: failed } = await supabase().storage.from("model-claims").uploadToSignedUrl(upload.path, upload.token, files[index], {
        contentType: files[index].type,
      });
      if (failed) warning = "Guardamos tu reclamo, pero algún archivo no se subió. Si hace falta te lo pediremos por correo.";
    }
    setBusy(false);
    setSent({ email: form.email, warning });
  }

  if (sent) {
    return (
      <div className="card flex flex-col gap-3">
        <h2>Recibimos tu reclamo</h2>
        <p className="text-sm text-muted">
          Revisaremos «{title}» y la evidencia que enviaste. Si procede, retiramos el modelo del marketplace. Te escribiremos a{" "}
          <strong className="text-white">{sent.email}</strong> con la resolución o si necesitamos algo más.
        </p>
        {sent.warning && <p className="text-sm text-warn">{sent.warning}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-2">
      {/* Hidden from people: bots fill it. */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <h2 className="sm:col-span-2">Tus datos de contacto</h2>
      <label className="label">
        Nombre completo *
        <input name="name" className="input" required minLength={2} maxLength={120} autoComplete="name" />
      </label>
      <label className="label">
        Correo *
        <input name="email" type="email" className="input" required maxLength={200} autoComplete="email" />
      </label>
      <label className="label">
        Teléfono o WhatsApp
        <input name="phone" type="tel" className="input" maxLength={40} autoComplete="tel" />
      </label>
      <label className="label">
        País
        <input name="country" className="input" maxLength={80} autoComplete="country-name" />
      </label>
      <label className="label">
        Empresa o estudio (si aplica)
        <input name="company" className="input" maxLength={160} autoComplete="organization" />
      </label>
      <label className="label">
        Eres… *
        <select name="relationship" className="input" defaultValue="owner">
          <option value="owner">El autor o dueño de los derechos</option>
          <option value="agent">Su representante (abogado, agente, empresa)</option>
        </select>
      </label>

      <h2 className="mt-2 sm:col-span-2">La obra y la evidencia</h2>
      <label className="label sm:col-span-2">
        Enlace a tu obra original
        <input name="original_url" type="url" className="input" maxLength={1000} placeholder="https://www.printables.com/model/… , tu tienda, tu Thingiverse…" />
      </label>
      <label className="label sm:col-span-2">
        ¿Por qué este modelo infringe tus derechos? *
        <textarea
          name="description"
          className="input"
          rows={5}
          required
          minLength={20}
          maxLength={5000}
          placeholder="Qué obra es tuya, desde cuándo la publicas, qué parte copió este modelo (archivos, fotos, descripción)…"
        />
      </label>
      <label className="label sm:col-span-2">
        Otros enlaces de evidencia (uno por línea)
        <textarea name="evidence_links" className="input" rows={3} maxLength={5000} placeholder={"https://… (registro de obra, publicación original con fecha, licencia)"} />
      </label>
      <div className="label sm:col-span-2">
        Archivos de evidencia (hasta {MAX_FILES}: imágenes, PDF; 10 MB cada uno)
        <div className="flex flex-wrap items-center gap-2">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`} className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-normal">
              {file.name}
              <button type="button" className="text-muted hover:text-white" aria-label={`Quitar ${file.name}`} onClick={() => setFiles(files.filter((_, at) => at !== index))}>
                ✕
              </button>
            </span>
          ))}
          {files.length < MAX_FILES && (
            <label className="btn cursor-pointer px-3 py-1.5 text-xs">
              + Adjuntar
              <input type="file" multiple accept="image/*,application/pdf,text/plain" className="sr-only" onChange={(event) => addFiles(event.target.files)} />
            </label>
          )}
        </div>
        <span className="font-normal">Capturas de tu publicación original con fecha, registro de obra, archivos de diseño, licencias…</span>
      </div>

      <h2 className="mt-2 sm:col-span-2">Declaraciones</h2>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input name="good_faith" type="checkbox" required className="mt-1" />
        Declaro de buena fe que el uso de la obra en este modelo no está autorizado por el dueño de los derechos, su representante ni la ley.
      </label>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input name="accurate" type="checkbox" required className="mt-1" />
        Declaro que la información de este reclamo es verdadera y que soy el dueño de los derechos o estoy autorizado para actuar en su nombre.
      </label>
      <label className="label sm:col-span-2">
        Firma: escribe tu nombre completo *
        <input name="signature" className="input" required minLength={2} maxLength={120} />
      </label>

      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <button className="btn btn-primary self-start" disabled={busy}>
          {busy ? "Enviando…" : "Enviar reclamo"}
        </button>
        <p className="text-xs text-muted">
          Un reclamo falso puede tener consecuencias legales. Podemos compartir tu nombre y tu reclamo con quien publicó el modelo para que pueda
          responder.
        </p>
      </div>
    </form>
  );
}
