import { supabase } from "./supabase";

// "Mis archivos": the user's library of 3D models and images, shared with the Kubbo3D tools
// (table user_files + private bucket user-files, see supabase/schema.sql).

export type UserFile = {
  id: string;
  name: string;
  path: string;
  size: number;
  kind: "model" | "image" | "other";
  app: "tools" | "calculator";
  created_at: string;
};

const BUCKET = "user-files";

export function fileKind(name: string): UserFile["kind"] {
  if (/\.(stl|obj|3mf)$/i.test(name)) return "model";
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(name)) return "image";
  return "other";
}

/** "12.3 MB" */
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function listFiles(): Promise<UserFile[]> {
  const { data, error } = await supabase().from("user_files").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(`No se pudieron leer tus archivos: ${error.message}`);
  return data ?? [];
}

/**
 * Saves a file in the user's library. A file with the same name and size is taken as already
 * saved, so opening the same model again does not store it twice.
 */
export async function saveFile(file: File, userId: string): Promise<UserFile | null> {
  const db = supabase();
  const existing = await db.from("user_files").select("*").eq("name", file.name).eq("size", file.size).limit(1).maybeSingle();
  if (existing.data) return existing.data;
  const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-120);
  const path = `${userId}/${crypto.randomUUID()}-${safe}`;
  const upload = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (upload.error) throw new Error(`No se pudo guardar ${file.name}: ${upload.error.message}`);
  const row = await db
    .from("user_files")
    .insert({ name: file.name, path, size: file.size, kind: fileKind(file.name), app: "calculator" })
    .select()
    .single();
  if (row.error) {
    // Without its row nobody would ever see the stored file: take it back out.
    await db.storage.from(BUCKET).remove([path]);
    throw new Error(`No se pudo guardar ${file.name}: ${row.error.message}`);
  }
  return row.data;
}

/** Downloads a saved file so the tools can open it like one picked from the computer. */
export async function openStoredFile(stored: UserFile): Promise<File> {
  const { data, error } = await supabase().storage.from(BUCKET).download(stored.path);
  if (error || !data) throw new Error(`No se pudo abrir ${stored.name}: ${error?.message ?? "sin datos"}`);
  return new File([data], stored.name, { type: data.type });
}

export async function deleteFile(stored: UserFile) {
  const db = supabase();
  const removed = await db.storage.from(BUCKET).remove([stored.path]);
  if (removed.error) throw new Error(`No se pudo borrar ${stored.name}: ${removed.error.message}`);
  const row = await db.from("user_files").delete().eq("id", stored.id);
  if (row.error) throw new Error(`No se pudo borrar ${stored.name}: ${row.error.message}`);
}
