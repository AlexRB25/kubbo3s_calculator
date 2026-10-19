"use client";

import Image from "next/image";
import { useState } from "react";
import { createUpload } from "@/app/actions";
import { browserClient } from "@/lib/supabase/browser";

const publicUrl = (bucket: string, path: string) => `${process.env.PB_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

/**
 * Photos of a store product. Files go straight from the browser to Supabase Storage and their
 * public URLs travel with the form as repeated `images` fields; the first one is the cover.
 */
export function ImagesInput({
  defaultValue,
  bucket = "store",
  single = false,
}: {
  defaultValue: string[];
  /** Public bucket the photos go to. */
  bucket?: "store" | "catalog";
  /** Only one photo: a new one replaces it. */
  single?: boolean;
}) {
  const [urls, setUrls] = useState(defaultValue);
  const [status, setStatus] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      for (const file of Array.from(files)) {
        setStatus(`Subiendo ${file.name}…`);
        const { path, token } = await createUpload(file.name, bucket);
        const { error } = await browserClient().storage.from(bucket).uploadToSignedUrl(path, token, file, {
          contentType: file.type,
          cacheControl: "31536000",
        });
        if (error) throw new Error(error.message);
        setUrls((current) => (single ? [publicUrl(bucket, path)] : [...current, publicUrl(bucket, path)]));
      }
      setStatus("");
    } catch (reason) {
      setStatus(`No se pudo subir: ${(reason as Error).message}`);
    }
  }

  return (
    <div className="label">
      {single ? "Foto" : "Fotos (la primera es la portada)"}
      <div className="flex flex-wrap gap-3">
        {urls.map((url, index) => (
          <div key={url} className="flex flex-col gap-1">
            <input type="hidden" name="images" value={url} />
            <div className="relative size-28 overflow-hidden rounded-lg border border-line bg-raised">
              <Image src={url} alt="" fill sizes="112px" className="object-cover" />
            </div>
            <div className="flex gap-1">
              {index > 0 && (
                <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setUrls([url, ...urls.filter((item) => item !== url)])}>
                  Portada
                </button>
              )}
              <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setUrls(urls.filter((item) => item !== url))}>
                Quitar
              </button>
            </div>
          </div>
        ))}
        <label className="btn size-28 flex-col text-center text-xs">
          {single ? (urls.length ? "Cambiar foto" : "+ Agregar foto") : "+ Agregar fotos"}
          <input type="file" accept="image/*" multiple={!single} className="sr-only" onChange={(event) => handleFiles(event.target.files)} />
        </label>
      </div>
      {status && <span role="status">{status}</span>}
    </div>
  );
}
