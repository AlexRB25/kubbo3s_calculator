"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { admin, must } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { cleanUrl } from "@/lib/format";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const number = (form: FormData, key: string) => Number(text(form, key) || 0);
const flag = (form: FormData, key: string) => form.get(key) === "on";
const optional = (form: FormData, key: string) => text(form, key) || null;
const optionalNumber = (form: FormData, key: string) => (text(form, key) ? number(form, key) : null);

/** "Filamento PLA+ Negro" -> "filamento-pla-negro" */
const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function signOut() {
  await (await serverClient()).auth.signOut();
  redirect("/login");
}

// ── Tienda: productos y categorías ──

/** One-time permission for the browser to upload a photo straight to a public bucket (store or catalog). */
export async function createUpload(fileName: string, bucket: "store" | "catalog" = "store") {
  await requireAdmin();
  if (bucket !== "store" && bucket !== "catalog") throw new Error("Bucket no válido.");
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const upload = await admin().storage.from(bucket).createSignedUploadUrl(`${crypto.randomUUID()}.${extension}`);
  if (upload.error) throw new Error(upload.error.message);
  return { path: upload.data.path, token: upload.data.token };
}

export async function saveStoreProduct(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const row = {
    name: text(form, "name"),
    description: text(form, "description"),
    category_id: optional(form, "category_id"),
    price: number(form, "price"),
    compare_price: optionalNumber(form, "compare_price"),
    stock: Math.round(number(form, "stock")),
    images: form.getAll("images").map(String).filter(Boolean).map(cleanUrl),
    active: flag(form, "active"),
    featured: flag(form, "featured"),
  };
  if (id) {
    must(await admin().from("store_products").update(row).eq("id", id));
  } else {
    // The slug is set once so links keep working if the product is renamed; the id suffix keeps it unique.
    const newId = crypto.randomUUID();
    must(await admin().from("store_products").insert({ ...row, id: newId, slug: `${slugify(row.name)}-${newId.slice(0, 6)}` }));
  }
  revalidatePath("/tienda");
  redirect("/tienda");
}

export async function deleteStoreProduct(form: FormData) {
  await requireAdmin();
  must(await admin().from("store_products").delete().eq("id", text(form, "id")));
  revalidatePath("/tienda");
  redirect("/tienda");
}

// ── Suscripciones asignadas a mano ──

const back = (key: "listo" | "error", message: string): never => redirect(`/suscripciones?${key}=${encodeURIComponent(message)}`);

/** Like must(), but a database error goes back to the page as a message instead of breaking it. */
function ok<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) back("error", `La base de datos respondió: ${result.error.message}`);
  return result.data;
}

/** Gives a plan to an account without charging it: for a while, until a date or for life. */
export async function grantSubscription(form: FormData) {
  await requireAdmin();
  const email = text(form, "email").toLowerCase();
  const users = ok(await admin().from("admin_users").select("id, email").ilike("email", email.replace(/[%_\\]/g, ""))) as { id: string; email: string }[];
  const user = users.find((item) => item.email.toLowerCase() === email) ?? back("error", `No hay ninguna cuenta con el correo ${email}.`);
  const plan =
    (ok(await admin().from("plans").select("id, name").eq("id", text(form, "plan")).maybeSingle()) as { id: string; name: string } | null) ??
    back("error", "Ese plan no existe.");

  const duration = text(form, "duration");
  const lifetime = duration === "life";
  let until: Date | null = null;
  if (duration === "date") {
    const day = text(form, "until");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) back("error", "Elige la fecha de vencimiento.");
    // End of that day in Mexico City.
    until = new Date(`${day}T23:59:59-06:00`);
  } else if (!lifetime) {
    until = new Date();
    if (duration === "7d") until.setDate(until.getDate() + 7);
    else until.setMonth(until.getMonth() + ({ "1m": 1, "3m": 3, "12m": 12 }[duration] ?? 1));
  }
  if (until && until.getTime() <= Date.now()) back("error", "La fecha de vencimiento ya pasó.");

  const now = new Date().toISOString();
  // Only one hand-given plan at a time.
  ok(
    await admin()
      .from("subscriptions")
      .update({ status: "cancelled", paid_until: now, updated_at: now })
      .eq("user_id", user.id)
      .eq("source", "admin")
      .eq("status", "authorized"),
  );
  ok(
    await admin()
      .from("subscriptions")
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        source: "admin",
        status: "authorized",
        lifetime,
        paid_until: until?.toISOString() ?? null,
        amount: 0,
        currency: "USD",
        payer_email: user.email,
        note: text(form, "note").slice(0, 200),
      }),
  );
  revalidatePath("/suscripciones");
  const end = until ? `hasta el ${until.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}` : "de por vida";
  back("listo", `${user.email} ahora tiene el plan ${plan.name} ${end}.`);
}

/** Ends a hand-given plan right away. Paid subscriptions (Stripe) are cancelled by their owner. */
export async function cancelSubscription(form: FormData) {
  await requireAdmin();
  const now = new Date().toISOString();
  ok(
    await admin()
      .from("subscriptions")
      .update({ status: "cancelled", paid_until: now, updated_at: now })
      .eq("id", text(form, "id"))
      .eq("source", "admin"),
  );
  revalidatePath("/suscripciones");
  back("listo", "Suscripción cancelada.");
}

// ── Categorías de productos ──

export async function saveProductCategory(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const row = { name: text(form, "name"), sort: number(form, "sort"), active: flag(form, "active") };
  must(id ? await admin().from("product_categories").update(row).eq("id", id) : await admin().from("product_categories").insert(row));
  revalidatePath("/categorias");
  redirect("/categorias");
}

export async function deleteProductCategory(form: FormData) {
  await requireAdmin();
  must(await admin().from("product_categories").delete().eq("id", text(form, "id")));
  revalidatePath("/categorias");
  redirect("/categorias");
}

// ── Catálogo de impresoras ──

export async function saveCatalogPrinter(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const row = {
    brand: text(form, "brand"),
    model: text(form, "model"),
    power_watts: number(form, "power_watts"),
    notes: text(form, "notes"),
    sort: number(form, "sort"),
    active: flag(form, "active"),
  };
  must(id ? await admin().from("printer_catalog").update(row).eq("id", id) : await admin().from("printer_catalog").insert(row));
  revalidatePath("/impresoras");
  redirect("/impresoras");
}

export async function deleteCatalogPrinter(form: FormData) {
  await requireAdmin();
  must(await admin().from("printer_catalog").delete().eq("id", text(form, "id")));
  revalidatePath("/impresoras");
  redirect("/impresoras");
}

// ── Escáner 3D (KIRI Engine) ──

export async function saveScanSettings(form: FormData) {
  await requireAdmin();
  must(
    await admin()
      .from("scan_settings")
      .update({ api_cost_usd: number(form, "api_cost_usd"), margin_pct: number(form, "margin_pct"), enabled: flag(form, "enabled"), updated_at: new Date().toISOString() })
      .eq("id", true),
  );
  revalidatePath("/escaner");
  redirect("/escaner");
}

export async function saveScanPack(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const row = { scans: Math.max(1, Math.round(number(form, "scans"))), sort: number(form, "sort"), active: flag(form, "active") };
  must(id ? await admin().from("scan_packs").update(row).eq("id", id) : await admin().from("scan_packs").insert(row));
  revalidatePath("/escaner");
  redirect("/escaner");
}

export async function deleteScanPack(form: FormData) {
  await requireAdmin();
  must(await admin().from("scan_packs").delete().eq("id", text(form, "id")));
  revalidatePath("/escaner");
  redirect("/escaner");
}

// ── Cursos (sección Aprende) ──

export async function saveCourse(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const title = text(form, "title");
  const row = {
    title,
    slug: slugify(text(form, "slug") || title).slice(0, 80) || `curso-${Date.now()}`,
    summary: text(form, "summary"),
    level: ["basico", "intermedio", "avanzado"].includes(text(form, "level")) ? text(form, "level") : "basico",
    cover_url: optional(form, "cover_url"),
    published: flag(form, "published"),
    sort: number(form, "sort"),
  };
  const saved = must(id ? await admin().from("courses").update(row).eq("id", id).select("id").single() : await admin().from("courses").insert(row).select("id").single()) as { id: string };
  revalidatePath("/cursos");
  redirect(`/cursos/${saved.id}`);
}

export async function deleteCourse(form: FormData) {
  await requireAdmin();
  must(await admin().from("courses").delete().eq("id", text(form, "id")));
  revalidatePath("/cursos");
  redirect("/cursos");
}

export async function saveLesson(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const course = text(form, "course_id");
  const row = {
    course_id: course,
    title: text(form, "title"),
    kind: ["video", "article", "link"].includes(text(form, "kind")) ? text(form, "kind") : "video",
    video_url: optional(form, "video_url"),
    link_url: optional(form, "link_url"),
    body: text(form, "body"),
    minutes: Math.max(0, Math.round(number(form, "minutes"))),
    sort: number(form, "sort"),
    published: flag(form, "published"),
  };
  must(id ? await admin().from("course_lessons").update(row).eq("id", id) : await admin().from("course_lessons").insert(row));
  revalidatePath(`/cursos/${course}`);
  redirect(`/cursos/${course}`);
}

export async function deleteLesson(form: FormData) {
  await requireAdmin();
  const course = text(form, "course_id");
  must(await admin().from("course_lessons").delete().eq("id", text(form, "id")));
  revalidatePath(`/cursos/${course}`);
  redirect(`/cursos/${course}`);
}

// ── Catálogo de empaques ──

export async function saveCatalogPackaging(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const cmToMm = (key: string) => Math.round(number(form, key) * 10);
  const row = {
    code: text(form, "code") || slugify(`${text(form, "name")}-${text(form, "length")}x${text(form, "width")}x${text(form, "height")}`),
    name: text(form, "name"),
    style: text(form, "style") === "mailer" ? "mailer" : "rsc",
    material: ["kraft", "blanca", "negra"].includes(text(form, "material")) ? text(form, "material") : "kraft",
    length_mm: cmToMm("length"),
    width_mm: cmToMm("width"),
    height_mm: cmToMm("height"),
    price_mxn: optionalNumber(form, "price_mxn"),
    wholesale_price_mxn: optionalNumber(form, "wholesale_price_mxn"),
    wholesale_min: optionalNumber(form, "wholesale_min"),
    weight_g: number(form, "weight_g"),
    notes: text(form, "notes"),
    sort: number(form, "sort"),
    active: flag(form, "active"),
  };
  must(id ? await admin().from("packaging_catalog").update(row).eq("id", id) : await admin().from("packaging_catalog").insert(row));
  revalidatePath("/empaques");
  redirect("/empaques");
}

export async function deleteCatalogPackaging(form: FormData) {
  await requireAdmin();
  must(await admin().from("packaging_catalog").delete().eq("id", text(form, "id")));
  revalidatePath("/empaques");
  redirect("/empaques");
}

// ── Catálogo de filamentos ──

export async function saveCatalogFilament(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  // The main colour first, then the others of a bicolor or rainbow filament.
  const colors = form.getAll("colors").map(String).filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 12);
  const row = {
    brand: text(form, "brand"),
    material: text(form, "material"),
    color_name: text(form, "color_name"),
    color_hex: colors[0] ?? "#9A9AA8",
    extra_colors: colors.slice(1),
    glow: flag(form, "glow"),
    image_url: form.getAll("images").map(String).filter(Boolean).map(cleanUrl)[0] ?? null,
    spool_g: number(form, "spool_g") || 1000,
    reference_price_kg: number(form, "reference_price_kg"),
    nozzle_temp: text(form, "nozzle_temp"),
    bed_temp: text(form, "bed_temp"),
    notes: text(form, "notes"),
    sort: number(form, "sort"),
    active: flag(form, "active"),
  };
  must(id ? await admin().from("filament_catalog").update(row).eq("id", id) : await admin().from("filament_catalog").insert(row));
  revalidatePath("/filamentos");
  redirect("/filamentos");
}

export async function deleteCatalogFilament(form: FormData) {
  await requireAdmin();
  must(await admin().from("filament_catalog").delete().eq("id", text(form, "id")));
  revalidatePath("/filamentos");
  redirect("/filamentos");
}

export async function saveStoreCategory(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const row = { name: text(form, "name"), sort: number(form, "sort") };
  must(
    id
      ? await admin().from("store_categories").update(row).eq("id", id)
      : await admin().from("store_categories").insert({ ...row, slug: slugify(row.name) }),
  );
  revalidatePath("/tienda");
}

export async function deleteStoreCategory(form: FormData) {
  await requireAdmin();
  must(await admin().from("store_categories").delete().eq("id", text(form, "id")));
  revalidatePath("/tienda");
}

// ── Tienda: pedidos y ajustes ──

export async function saveOrder(form: FormData) {
  await requireAdmin();
  // Cancelling returns the pieces to stock; the database trigger takes care of it.
  must(
    await admin()
      .from("store_orders")
      .update({ status: text(form, "status"), tracking: text(form, "tracking") })
      .eq("id", text(form, "id")),
  );
  revalidatePath("/pedidos");
}

const REPORT_STATUSES = ["new", "reviewing", "fixed", "dismissed"];

export async function saveBugReport(form: FormData) {
  await requireAdmin();
  const status = text(form, "status");
  if (!REPORT_STATUSES.includes(status)) throw new Error("Estado no válido.");
  must(
    await admin()
      .from("bug_reports")
      .update({ status, admin_note: text(form, "admin_note"), updated_at: new Date().toISOString() })
      .eq("id", text(form, "id")),
  );
  await markRepliesRead(text(form, "id"));
  revalidatePath("/reportes");
}

/** The user's answers on this report count as seen by the administrator. */
async function markRepliesRead(report: string) {
  await admin().from("bug_report_messages").update({ read_at: new Date().toISOString() }).eq("report_id", report).eq("from_admin", false).is("read_at", null);
}

/** A message to whoever sent the report: they see it in Mis reportes, with a notice at the top of the page. */
export async function replyBugReport(form: FormData) {
  await requireAdmin();
  const report = text(form, "id");
  const body = text(form, "body");
  if (!body) throw new Error("Escribe el mensaje.");
  if (body.length > 5000) throw new Error("El mensaje es muy largo (máximo 5000 caracteres).");
  must(await admin().from("bug_report_messages").insert({ report_id: report, from_admin: true, body }));
  await markRepliesRead(report);
  // Answering a new report means it is being looked at.
  must(await admin().from("bug_reports").update({ status: "reviewing", updated_at: new Date().toISOString() }).eq("id", report).eq("status", "new"));
  revalidatePath("/reportes");
}

export async function saveStoreSettings(form: FormData) {
  await requireAdmin();
  must(
    await admin()
      .from("store_settings")
      .update({
        shipping_flat: number(form, "shipping_flat"),
        free_shipping_from: optionalNumber(form, "free_shipping_from"),
        payment_instructions: text(form, "payment_instructions"),
        whatsapp: text(form, "whatsapp").replace(/\D/g, ""),
        contact_email: text(form, "contact_email"),
      })
      .eq("id", 1),
  );
  revalidatePath("/ajustes");
}

// ── Catálogos públicos: dominios propios ──

/**
 * Marks a user's own domain as connected (after adding it to the hosting project and checking its DNS),
 * or disconnects it. Only a connected domain serves the catalog.
 */
export async function setCatalogDomain(form: FormData) {
  await requireAdmin();
  const result = await admin()
    .from("catalogs")
    .update({ domain_verified: flag(form, "verified") })
    .eq("user_id", text(form, "user_id"));
  if (result.error) {
    const message = result.error.message.includes("catalogs_domain_idx") ? "Ese dominio ya está conectado a otro catálogo." : result.error.message;
    redirect(`/catalogos?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/catalogos");
}

// ── Marketplace de modelos 3D ──

export async function saveMarketSettings(form: FormData) {
  await requireAdmin();
  must(
    await admin()
      .from("market_settings")
      .update({ fee_pct: number(form, "fee_pct"), min_payout: number(form, "min_payout"), hold_days: Math.round(number(form, "hold_days")) })
      .eq("id", 1),
  );
  revalidatePath("/marketplace");
}

/** Hides a model from everyone except its author (copyright claims, offensive content…), or shows it again. */
export async function setModelBlocked(form: FormData) {
  await requireAdmin();
  const blocked = flag(form, "blocked");
  must(
    await admin()
      .from("models")
      .update({ blocked, blocked_reason: blocked ? text(form, "reason") : "" })
      .eq("id", text(form, "model_id")),
  );
  // Hiding a model settles its open reports.
  if (blocked) must(await admin().from("model_reports").update({ status: "resolved" }).eq("model_id", text(form, "model_id")).eq("status", "new"));
  revalidatePath("/marketplace");
}

export async function resolveReport(form: FormData) {
  await requireAdmin();
  must(await admin().from("model_reports").update({ status: "resolved" }).eq("id", text(form, "id")));
  revalidatePath("/marketplace");
}

/** Marks a payout request as paid (after sending the money) or rejected; the reference is shown to the seller. */
export async function processPayout(form: FormData) {
  await requireAdmin();
  const status = text(form, "status") === "paid" ? "paid" : "rejected";
  const reference = text(form, "reference");
  if (status === "paid" && !reference) redirect(`/retiros?error=${encodeURIComponent("Escribe el folio o referencia del pago.")}`);
  must(
    await admin()
      .from("maker_payouts")
      .update({ status, reference, processed_at: new Date().toISOString() })
      .eq("id", text(form, "id"))
      .eq("status", "requested"),
  );
  revalidatePath("/retiros");
}

/**
 * Settles a copyright claim. Accepting it takes the model down (with the claim as the reason, so the seller
 * sees why); rejecting it only keeps the note. The claimant is answered by email from the panel.
 */
export async function resolveClaim(form: FormData) {
  await requireAdmin();
  const accepted = text(form, "decision") === "accepted";
  const now = new Date().toISOString();
  must(
    await admin()
      .from("model_claims")
      .update({ status: accepted ? "accepted" : "rejected", admin_note: text(form, "note"), resolved_at: now })
      .eq("id", text(form, "id"))
      .eq("status", "new"),
  );
  if (accepted) {
    must(
      await admin()
        .from("models")
        .update({ blocked: true, blocked_reason: "Retirado por un reclamo de derechos de autor." })
        .eq("id", text(form, "model_id")),
    );
  }
  revalidatePath("/derechos");
  revalidatePath("/marketplace");
}

// ── Equipos de usuarios y servicio técnico: el admin oculta anuncios o técnicos y borra calificaciones ──

export async function setListingBlocked(form: FormData) {
  await requireAdmin();
  must(await admin().from("equipment_listings").update({ blocked: text(form, "blocked") === "true" }).eq("id", text(form, "id")));
  revalidatePath("/equipos");
}

export async function deleteListing(form: FormData) {
  await requireAdmin();
  const db = admin();
  const { data } = await db.from("equipment_listings").select("images").eq("id", text(form, "id")).maybeSingle();
  must(await db.from("equipment_listings").delete().eq("id", text(form, "id")));
  if (data?.images?.length) await db.storage.from("equipment").remove(data.images);
  revalidatePath("/equipos");
}

export async function setProviderBlocked(form: FormData) {
  await requireAdmin();
  must(await admin().from("tech_providers").update({ blocked: text(form, "blocked") === "true" }).eq("user_id", text(form, "id")));
  revalidatePath("/tecnicos");
}

export async function deleteTechReview(form: FormData) {
  await requireAdmin();
  must(await admin().from("tech_reviews").delete().eq("id", text(form, "id")));
  revalidatePath("/tecnicos");
}
