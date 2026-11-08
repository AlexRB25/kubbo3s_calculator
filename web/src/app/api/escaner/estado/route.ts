import { kiriConfigured, refreshScan, type ScanRow } from "@/lib/kiri";
import { adminClient } from "@/lib/server";

export const maxDuration = 120;

/**
 * The user's scans, the ones in progress asked again to KIRI, and a download link (valid one hour) for the
 * finished ones. Header "Authorization: Bearer <access token>".
 */
export async function GET(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await adminClient().auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return Response.json({ error: "Entra a tu cuenta." }, { status: 401 });

  const db = adminClient();
  const { data, error } = await db.from("scans").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(50);
  if (error) return Response.json({ error: "No se pudieron leer tus escaneos." }, { status: 502 });

  const scans = await Promise.all(
    ((data ?? []) as ScanRow[]).map(async (scan) => {
      let current = scan;
      if (kiriConfigured()) current = await refreshScan(scan).catch(() => scan);
      const url = current.result_path ? (await db.storage.from("scans").createSignedUrl(current.result_path, 3600)).data?.signedUrl ?? null : null;
      return { ...current, url };
    }),
  );
  return Response.json({ scans });
}
