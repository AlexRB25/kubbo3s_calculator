import { kiriConfigured, refreshScan, type ScanRow } from "@/lib/kiri";
import { adminClient } from "@/lib/server";

export const maxDuration = 120;

/**
 * KIRI Engine calls this when a model changes status (configure it in KIRI's dashboard → Settings → Webhooks:
 * https://<calculadora>/api/escaner/webhook). The call only says which task changed; its status is asked again
 * to KIRI with our key, so a forged call can do nothing. KIRI needs a 200 back (it retries otherwise).
 */
export async function POST(request: Request) {
  if (!kiriConfigured()) return new Response(null, { status: 200 });
  const body = await request.json().catch(() => null);
  const serialize = String(body?.serialize ?? body?.data?.serialize ?? "");
  if (!/^[\w-]{4,100}$/.test(serialize)) return new Response(null, { status: 200 });
  const { data: scan } = await adminClient().from("scans").select("*").eq("kiri_serialize", serialize).maybeSingle();
  if (scan) await refreshScan(scan as ScanRow).catch(() => null);
  return new Response(null, { status: 200 });
}
