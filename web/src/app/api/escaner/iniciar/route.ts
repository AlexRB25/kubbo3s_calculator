import { preflight, withCors } from "@/lib/cors";
import { kiriConfigured, startScan, type ScanRow } from "@/lib/kiri";
import { adminClient, UUID } from "@/lib/server";

// Sending big videos or hundreds of photos to KIRI takes a while.
export const maxDuration = 300;

/**
 * Sends a claimed scan (claim_scan()) to KIRI once its photos or video are uploaded to the bucket scans, in
 * <user>/<scan>/in/. Header "Authorization: Bearer <access token>", body {"scan_id"}.
 */
export const OPTIONS = preflight;

export const POST = async (request: Request) => withCors(request, await handle(request));

async function handle(request: Request) {
  if (!kiriConfigured()) return Response.json({ error: "El escáner todavía no está configurado." }, { status: 503 });
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await adminClient().auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return Response.json({ error: "Entra a tu cuenta para escanear." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = String(body?.scan_id ?? "");
  if (!UUID.test(id)) return Response.json({ error: "Escaneo inválido." }, { status: 400 });
  const { data: scan } = await adminClient().from("scans").select("*").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!scan) return Response.json({ error: "No encontramos ese escaneo." }, { status: 404 });
  if (scan.status !== "uploading") return Response.json({ scan });

  const started = await startScan(scan as ScanRow);
  return Response.json({ scan: started }, { status: started.status === "failed" ? 422 : 200 });
}
