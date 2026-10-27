import { adminClient } from "@/lib/server";

/** Tool pages of the tools site the app may open ("" = its home). */
const TOOL = /^[a-z0-9-]{0,40}$/;

/**
 * For the mobile app: a one-time link that opens a tool of the tools site already signed in.
 * Header: "Authorization: Bearer <the app's access token>". Body: {"tool": "llavero"}. Answers {"url"}.
 * The link carries a magic-link token (not the app's tokens), so the browser gets its own session
 * and the app's is never shared.
 */
export async function POST(request: Request) {
  const toolsUrl = (process.env.TOOLS_URL || process.env.PB_TOOLS_URL || "").replace(/\/$/, "");
  if (!toolsUrl) return Response.json({ error: "Falta la dirección del sitio de herramientas (TOOLS_URL)." }, { status: 503 });
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.PB_SUPABASE_URL) {
    // Without the secret key the tools still open; the user signs in there.
    return Response.json({ url: toolsUrl, signedIn: false });
  }

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Inicia sesión en la app." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const tool = String(body?.tool ?? "");
  if (!TOOL.test(tool)) return Response.json({ error: "Herramienta inválida." }, { status: 400 });

  const db = adminClient();
  const { data: user, error } = await db.auth.getUser(token);
  if (error || !user.user?.email) return Response.json({ error: "Tu sesión caducó: vuelve a entrar en la app." }, { status: 401 });

  const link = await db.auth.admin.generateLink({ type: "magiclink", email: user.user.email });
  const hashed = link.data?.properties?.hashed_token;
  if (link.error || !hashed) return Response.json({ error: "No se pudo preparar la entrada a las herramientas." }, { status: 502 });

  // After "#": the browser keeps it to itself, so it never shows in a server log.
  const next = encodeURIComponent(`/${tool}`);
  return Response.json({ url: `${toolsUrl}/entrar/app#token_hash=${encodeURIComponent(hashed)}&next=${next}`, signedIn: true });
}
