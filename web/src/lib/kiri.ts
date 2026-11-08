import { adminClient } from "./server";

// Server only: KIRI Engine's photogrammetry API (https://docs.kiriengine.app). The key never leaves the server.

const BASE = "https://api.kiriengine.app/api/v1/open";

export const kiriConfigured = () => Boolean(process.env.KIRI_API_KEY);

const auth = () => ({ Authorization: `Bearer ${process.env.KIRI_API_KEY}` });

type KiriAnswer<T> = { code: number; msg: string; data: T; ok: boolean };

async function kiri<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { ...auth(), ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = (await response.json().catch(() => null)) as KiriAnswer<T> | null;
  if (!response.ok || !body?.ok) throw new Error(body?.msg || `KIRI respondió ${response.status}`);
  return body.data;
}

/** KIRI's model statuses: -1 uploading, 0 processing, 1 failed, 2 done, 3 queuing, 4 expired. */
const STATUS: Record<number, "processing" | "failed" | "done" | "queued" | "expired"> = { [-1]: "processing", 0: "processing", 1: "failed", 2: "done", 3: "queued", 4: "expired" };

export type ScanRow = {
  id: string;
  user_id: string;
  name: string;
  kind: "photos" | "video";
  file_format: string;
  status: "uploading" | "queued" | "processing" | "done" | "failed" | "expired";
  kiri_serialize: string | null;
  result_path: string | null;
  error: string;
};

/** Files the user uploaded for a scan, in the bucket scans: <user>/<scan>/in/… */
async function inputs(scan: ScanRow) {
  const folder = `${scan.user_id}/${scan.id}/in`;
  const { data, error } = await adminClient().storage.from("scans").list(folder, { limit: 400, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error("No se pudieron leer los archivos subidos.");
  return (data ?? []).filter((item) => item.id).map((item) => `${folder}/${item.name}`);
}

/**
 * Sends the uploaded photos or video to KIRI and records its task. A failure marks the scan failed (so it is
 * not charged to the user) and says why.
 */
export async function startScan(scan: ScanRow) {
  const db = adminClient();
  try {
    const paths = await inputs(scan);
    if (scan.kind === "photos" && (paths.length < 20 || paths.length > 300)) throw new Error(`Se necesitan de 20 a 300 fotos (subiste ${paths.length}).`);
    if (scan.kind === "video" && paths.length !== 1) throw new Error("Sube un solo video.");
    const form = new FormData();
    for (const path of paths) {
      const { data, error } = await db.storage.from("scans").download(path);
      if (error || !data) throw new Error("No se pudo leer un archivo subido.");
      form.append(scan.kind === "photos" ? "imagesFiles" : "videoFile", data, path.split("/").pop());
    }
    // High model quality, 4K texture, automatic masking of the background.
    form.append("modelQuality", "0");
    form.append("textureQuality", "0");
    form.append("isMask", "1");
    form.append("textureSmoothing", "0");
    form.append("fileFormat", scan.file_format);
    const task = await kiri<{ serialize: string }>(scan.kind === "photos" ? "/photo/image" : "/photo/video", { method: "POST", body: form });
    await db.from("scans").update({ status: "processing", kiri_serialize: task.serialize, updated_at: new Date().toISOString() }).eq("id", scan.id);
    // The photos are no longer needed once KIRI has them.
    if (paths.length) await db.storage.from("scans").remove(paths);
    return { ...scan, status: "processing" as const, kiri_serialize: task.serialize };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el escaneo.";
    await db.from("scans").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", scan.id);
    return { ...scan, status: "failed" as const, error: message };
  }
}

/**
 * Asks KIRI how a scan goes; when it is done, keeps the model zip in our storage (KIRI's link lasts an hour)
 * so the user can download it any time.
 */
export async function refreshScan(scan: ScanRow): Promise<ScanRow> {
  if (!scan.kiri_serialize || !["processing", "queued"].includes(scan.status)) return scan;
  const db = adminClient();
  const { status } = await kiri<{ status: number }>(`/model/getStatus?serialize=${encodeURIComponent(scan.kiri_serialize)}`);
  const next = STATUS[status] ?? "processing";
  if (next === "done") {
    const { modelUrl } = await kiri<{ modelUrl: string }>(`/model/getModelZip?serialize=${encodeURIComponent(scan.kiri_serialize)}`);
    const zip = await fetch(modelUrl, { cache: "no-store" });
    if (!zip.ok) throw new Error("No se pudo bajar el modelo de KIRI.");
    const path = `${scan.user_id}/${scan.id}/modelo-${scan.file_format}.zip`;
    const saved = await db.storage.from("scans").upload(path, await zip.arrayBuffer(), { contentType: "application/zip", upsert: true });
    if (saved.error) throw new Error("No se pudo guardar el modelo.");
    await db.from("scans").update({ status: "done", result_path: path, updated_at: new Date().toISOString() }).eq("id", scan.id);
    return { ...scan, status: "done", result_path: path };
  }
  if (next !== scan.status) {
    const error = next === "failed" ? "KIRI no pudo reconstruir el objeto. Revisa los consejos y vuelve a intentarlo; este escaneo no se te cobra." : next === "expired" ? "El escaneo venció en KIRI." : "";
    await db.from("scans").update({ status: next, error, updated_at: new Date().toISOString() }).eq("id", scan.id);
    return { ...scan, status: next, error };
  }
  return scan;
}

/** KIRI's credit balance (for the admin panel). */
export const kiriBalance = () => kiri<{ balance: number }>("/balance").then((data) => data.balance);
