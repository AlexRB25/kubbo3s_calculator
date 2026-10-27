"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ChangeEvent } from "react";
import { MarketPanel } from "@/components/market/Panel";
import { money } from "@/lib/format";
import { CATEGORIES, fileSize, MAX_FILE_MB, MAX_IMAGE_MB, mediaUrl, MODEL_EXTENSIONS, safeFileName, type Model, type ModelFile } from "@/lib/market";
import { supabase } from "@/lib/supabase";

export default function EditModelPage() {
  return (
    <MarketPanel title="Modelo">
      {(session) => (
        // useSearchParams needs a Suspense boundary to prerender the rest of the page.
        <Suspense>
          <Editor userId={session.user.id} />
        </Suspense>
      )}
    </MarketPanel>
  );
}

type Draft = Pick<Model, "title" | "description" | "category" | "price" | "commercial" | "print_notes" | "images" | "files" | "status"> & { tags: string };

const EMPTY: Draft = { title: "", description: "", category: "figuras", tags: "", price: 0, commercial: false, print_notes: "", images: [], files: [], status: "draft" };

const random = () => Math.random().toString(36).slice(2, 8);

function Editor({ userId }: { userId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const existing = params.get("id");
  // A new model gets its id now: photos and files go up to <user>/<id>/ before the first save.
  const [id] = useState(() => existing ?? crypto.randomUUID());
  const [draft, setDraft] = useState<Draft | null>(existing ? null : EMPTY);
  const saved = Boolean(existing);
  const [sales, setSales] = useState(0);
  const [feePct, setFeePct] = useState<number | null>(null);
  const [rights, setRights] = useState(Boolean(existing));
  const [uploading, setUploading] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const folder = `${userId}/${id}`;

  useEffect(() => {
    const db = supabase();
    db.from("market_settings")
      .select("fee_pct")
      .maybeSingle()
      .then(({ data }) => setFeePct(data ? Number(data.fee_pct) : null));
    if (!existing) return;
    db.from("models")
      .select("*")
      .eq("id", existing)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: failed }) => {
        if (failed || !data) return setError(failed?.message ?? "No encontramos ese modelo.");
        setDraft({ ...(data as Model), tags: (data as Model).tags.join(", ") });
        setSales((data as Model).sales);
      });
  }, [existing, userId]);

  if (!draft) return <p className={error ? "error" : "text-muted"}>{error || "Cargando…"}</p>;
  const set = (change: Partial<Draft>) => setDraft({ ...draft, ...change });
  const price = Number(draft.price) || 0;

  async function addImages(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    const added: string[] = [];
    for (const file of chosen) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name} no es una imagen.`);
        continue;
      }
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        setError(`${file.name} pesa más de ${MAX_IMAGE_MB} MB.`);
        continue;
      }
      setUploading(file.name);
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${folder}/foto-${Date.now()}-${random()}.${extension}`;
      const { error: failed } = await supabase().storage.from("model-media").upload(path, file, { contentType: file.type });
      if (failed) setError(`No se subió ${file.name}: ${failed.message}`);
      else added.push(path);
    }
    setUploading("");
    setDraft((current) => current && { ...current, images: [...current.images, ...added].slice(0, 12) });
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    const added: ModelFile[] = [];
    for (const file of chosen) {
      const name = safeFileName(file.name);
      if (!MODEL_EXTENSIONS.some((extension) => name.endsWith(extension))) {
        setError(`${file.name}: sube archivos ${MODEL_EXTENSIONS.join(", ")}.`);
        continue;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`${file.name} pesa más de ${MAX_FILE_MB} MB: compríme en .zip o divídelo.`);
        continue;
      }
      setUploading(file.name);
      // The original name is kept for the buyer; the storage key gets a short tail so two files never collide.
      const path = `${folder}/${random()}-${name}`;
      const { error: failed } = await supabase().storage.from("model-files").upload(path, file, { contentType: "application/octet-stream" });
      if (failed) setError(`No se subió ${file.name}: ${failed.message}`);
      else added.push({ path, name, size: file.size });
    }
    setUploading("");
    setDraft((current) => current && { ...current, files: [...current.files, ...added].slice(0, 20) });
  }

  function removeImage(path: string) {
    // Like files, the stored photo is deleted when saving.
    set({ images: draft!.images.filter((item) => item !== path) });
  }

  function removeFile(file: ModelFile) {
    if (sales > 0 && !window.confirm(`Quien ya compró este modelo dejará de ver ${file.name}. ¿Quitarlo?`)) return;
    // The stored file is deleted when saving, so cancelling the edit keeps it.
    set({ files: draft!.files.filter((item) => item.path !== file.path) });
  }

  function move(index: number) {
    const images = [...draft!.images];
    [images[0], images[index]] = [images[index], images[0]];
    set({ images });
  }

  async function save(status: Draft["status"]) {
    setError("");
    if (status === "published" && !rights) return setError("Confirma que el modelo es tuyo o que tienes derecho a compartirlo.");
    setBusy(true);
    const row = {
      title: draft!.title.trim(),
      description: draft!.description.trim(),
      category: draft!.category,
      tags: draft!.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      price,
      commercial: draft!.commercial,
      print_notes: draft!.print_notes.trim(),
      images: draft!.images,
      files: draft!.files,
      status,
    };
    const db = supabase().from("models");
    const { data: before } = saved ? await db.select("files, images").eq("id", id).maybeSingle() : { data: null };
    const { error: failed } = saved ? await db.update(row).eq("id", id) : await db.insert({ id, ...row });
    setBusy(false);
    if (failed) return setError(failed.message);
    // Files and photos taken out of the model are deleted from storage only once the change is saved.
    const kept = new Set(row.files.map((file) => file.path));
    const gone = ((before?.files ?? []) as ModelFile[]).map((file) => file.path).filter((path) => !kept.has(path));
    const goneImages = ((before?.images ?? []) as string[]).filter((path) => !row.images.includes(path));
    await Promise.all([
      gone.length ? supabase().storage.from("model-files").remove(gone) : null,
      goneImages.length ? supabase().storage.from("model-media").remove(goneImages) : null,
    ]);
    router.push(status === "published" ? `/modelos/${id}` : "/modelos/panel");
  }

  async function remove() {
    if (!window.confirm(`¿Borrar «${draft!.title || "este modelo"}» con sus fotos y archivos? No se puede deshacer.`)) return;
    setBusy(true);
    const { error: failed } = saved ? await supabase().from("models").delete().eq("id", id) : { error: null };
    if (failed) {
      setBusy(false);
      return setError(failed.message);
    }
    await Promise.all([
      supabase().storage.from("model-media").remove(draft!.images),
      supabase().storage.from("model-files").remove(draft!.files.map((file) => file.path)),
    ]);
    router.push("/modelos/panel");
  }

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-4">
        <label className="label">
          Nombre
          <input className="input" value={draft.title} maxLength={120} onChange={(event) => set({ title: event.target.value })} placeholder="Maceta Groot con drenaje" />
        </label>
        <label className="label">
          Descripción
          <textarea className="input" rows={5} maxLength={5000} value={draft.description} onChange={(event) => set({ description: event.target.value })} placeholder="Qué es, medidas, qué incluye…" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Categoría
            <select className="input" value={draft.category} onChange={(event) => set({ category: event.target.value })}>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Etiquetas (separadas por coma)
            <input className="input" value={draft.tags} onChange={(event) => set({ tags: event.target.value })} placeholder="groot, maceta, marvel" />
          </label>
        </div>
        <label className="label">
          Cómo imprimirlo
          <textarea className="input" rows={3} maxLength={2000} value={draft.print_notes} onChange={(event) => set({ print_notes: event.target.value })} placeholder="PLA, capa 0.2 mm, 15 % relleno, sin soportes…" />
        </label>

        <section className="flex flex-col gap-2">
          <h2 className="text-base">Fotos ({draft.images.length}/12)</h2>
          <p className="text-xs text-muted">La primera es la portada. Usa fotos de la pieza impresa o renders; máximo {MAX_IMAGE_MB} MB cada una.</p>
          <div className="flex flex-wrap gap-2">
            {draft.images.map((path, index) => (
              <div key={path} className="relative size-24 overflow-hidden rounded-lg border border-line bg-raised">
                <Image src={mediaUrl(path)} alt="" fill sizes="96px" className="object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/80 text-xs">
                  {index > 0 ? (
                    <button type="button" className="px-1.5 py-0.5 hover:text-brand" onClick={() => move(index)}>
                      Portada
                    </button>
                  ) : (
                    <span className="px-1.5 py-0.5 text-brand">Portada</span>
                  )}
                  <button type="button" aria-label="Quitar foto" className="px-1.5 py-0.5 hover:text-bad" onClick={() => removeImage(path)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {draft.images.length < 12 && (
              <label className="flex size-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted hover:text-white">
                + Foto
                <input type="file" accept="image/*" multiple className="sr-only" onChange={addImages} disabled={Boolean(uploading)} />
              </label>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base">Archivos ({draft.files.length}/20)</h2>
          <p className="text-xs text-muted">
            STL, 3MF (con tu perfil de impresión), OBJ, STEP o un .zip; máximo {MAX_FILE_MB} MB cada uno. Solo los descarga quien lo compra (o cualquiera con cuenta si es gratis).
          </p>
          {draft.files.length > 0 && (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {draft.files.map((file) => (
                <li key={file.path} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted">{fileSize(file.size)}</span>
                  <button type="button" className="text-muted hover:text-bad" onClick={() => removeFile(file)} aria-label={`Quitar ${file.name}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {draft.files.length < 20 && (
            <label className="btn cursor-pointer self-start">
              + Subir archivos
              <input type="file" accept={MODEL_EXTENSIONS.join(",")} multiple className="sr-only" onChange={addFiles} disabled={Boolean(uploading)} />
            </label>
          )}
          {uploading && <p className="text-sm text-brand">Subiendo {uploading}…</p>}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="card flex flex-col gap-3">
          <label className="label">
            Precio en pesos (0 = gratis)
            <input
              className="input"
              type="number"
              min={0}
              max={20000}
              step="1"
              value={draft.price}
              onChange={(event) => set({ price: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>
          {price > 0 && price < 10 && <p className="text-xs text-warn">El precio mínimo es $10 (o 0 para gratis).</p>}
          {price >= 10 && feePct != null && (
            <p className="text-xs text-muted">
              Por cada venta recibes <strong className="text-money">{money(price - Math.round(price * feePct) / 100)}</strong> (Kubbo se queda el {feePct} %).
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={draft.commercial} onChange={(event) => set({ commercial: event.target.checked })} />
            <span>
              Licencia comercial: quien lo obtenga puede vender las piezas impresas
              <span className="block text-xs text-muted">Sin marcar: solo uso personal.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={rights} onChange={(event) => setRights(event.target.checked)} />
            <span>El modelo es mío o tengo permiso para venderlo/compartirlo, y no infringe marcas ni derechos de autor.</span>
          </label>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-lg" disabled={busy || Boolean(uploading)} onClick={() => save("published")}>
          {busy ? "Guardando…" : draft.status === "published" ? "Guardar cambios" : "Publicar"}
        </button>
        <button className="btn" disabled={busy || Boolean(uploading)} onClick={() => save("draft")}>
          {draft.status === "published" ? "Despublicar (pasar a borrador)" : "Guardar borrador"}
        </button>
        {sales === 0 ? (
          <button className="btn text-bad" disabled={busy} onClick={remove}>
            Borrar modelo
          </button>
        ) : (
          <p className="text-xs text-muted">Tiene {sales} venta(s): no se puede borrar, pero puedes despublicarlo y quien lo compró lo sigue descargando.</p>
        )}
      </aside>
    </div>
  );
}
