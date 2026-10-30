import { adminClient, UUID } from "@/lib/server";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_LIKE = /^https?:\/\/\S+$/i;
/** Evidence files: pictures, PDFs and documents, up to 5 of 10 MB. */
const FILE_TYPES = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/plain)$/;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/**
 * A copyright claim over a marketplace model, with or without an account. Saves it for the admin panel and
 * answers one-time upload links for the evidence files, which the browser uploads straight to the private
 * bucket. A hidden field and a minimum time on the form keep most bots out.
 */
export async function POST(request: Request) {
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.PB_SUPABASE_URL) {
    return Response.json({ error: "Los reclamos todavía no están configurados. Escríbenos por correo." }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  // Bots fill the hidden field or send the form in a blink: answer as if it worked and keep nothing.
  if (body.website || Date.now() - Number(body.started_at) < 4000) return Response.json({ ok: true, uploads: [] });

  const modelId = String(body.model_id ?? "");
  const claim = {
    claimant_name: text(body.name, 120),
    claimant_email: text(body.email, 200).toLowerCase(),
    claimant_phone: text(body.phone, 40),
    company: text(body.company, 160),
    country: text(body.country, 80),
    relationship: body.relationship === "agent" ? "agent" : "owner",
    original_url: text(body.original_url, 1000),
    description: text(body.description, 5000),
    evidence_links: (Array.isArray(body.evidence_links) ? body.evidence_links : [])
      .map((link: unknown) => text(link, 1000))
      .filter((link: string) => URL_LIKE.test(link))
      .slice(0, 10),
    good_faith: body.good_faith === true,
    accurate: body.accurate === true,
    signature: text(body.signature, 120),
  };
  const files = (Array.isArray(body.files) ? body.files : []) as { name?: string; size?: number; type?: string }[];

  if (!UUID.test(modelId)) return Response.json({ error: "Modelo inválido." }, { status: 400 });
  if (claim.claimant_name.length < 2) return Response.json({ error: "Escribe tu nombre completo." }, { status: 400 });
  if (!EMAIL.test(claim.claimant_email)) return Response.json({ error: "Escribe un correo válido para contactarte." }, { status: 400 });
  if (claim.original_url && !URL_LIKE.test(claim.original_url)) return Response.json({ error: "El enlace a la obra original debe empezar con https://" }, { status: 400 });
  if (claim.description.length < 20) return Response.json({ error: "Explica en al menos 20 caracteres por qué el modelo es tuyo." }, { status: 400 });
  if (!claim.original_url && claim.evidence_links.length === 0 && files.length === 0) {
    return Response.json({ error: "Agrega evidencia: el enlace a tu obra original, otros enlaces o archivos." }, { status: 400 });
  }
  if (!claim.good_faith || !claim.accurate) return Response.json({ error: "Marca las dos declaraciones para enviar el reclamo." }, { status: 400 });
  if (claim.signature.length < 2) return Response.json({ error: "Escribe tu nombre completo como firma." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `Puedes adjuntar hasta ${MAX_FILES} archivos.` }, { status: 400 });
  for (const file of files) {
    if (!FILE_TYPES.test(String(file.type ?? ""))) return Response.json({ error: `«${file.name}»: solo imágenes, PDF o texto.` }, { status: 400 });
    if (!(Number(file.size) > 0 && Number(file.size) <= MAX_FILE_BYTES)) return Response.json({ error: `«${file.name}» pesa más de 10 MB.` }, { status: 400 });
  }

  const db = adminClient();
  const model = await db.from("models").select("id").eq("id", modelId).maybeSingle();
  if (model.error) return Response.json({ error: "No pudimos leer el modelo. Intenta de nuevo." }, { status: 502 });
  if (!model.data) return Response.json({ error: "Ese modelo ya no existe." }, { status: 404 });

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const userId = token ? ((await db.auth.getUser(token)).data.user?.id ?? null) : null;

  const id = crypto.randomUUID();
  const paths = files.map((file, index) => `${id}/${index + 1}-${String(file.name ?? "archivo").replace(/[^\w.-]+/g, "_").slice(-80)}`);
  const insert = await db.from("model_claims").insert({ id, model_id: modelId, user_id: userId, evidence_files: paths, ...claim });
  if (insert.error?.code === "23505") {
    return Response.json({ error: "Ya tienes un reclamo pendiente para este modelo con ese correo. Te contactaremos." }, { status: 409 });
  }
  if (insert.error) {
    console.error("No se guardó el reclamo:", insert.error);
    return Response.json({ error: "No pudimos guardar tu reclamo. Intenta de nuevo." }, { status: 502 });
  }

  const uploads = [];
  for (const path of paths) {
    const signed = await db.storage.from("model-claims").createSignedUploadUrl(path);
    if (signed.error) return Response.json({ ok: true, uploads, warning: "Guardamos tu reclamo, pero no pudimos recibir tus archivos." });
    uploads.push({ path: signed.data.path, token: signed.data.token });
  }
  return Response.json({ ok: true, uploads });
}
