"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { admin, must } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

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
    images: form.getAll("images").map(String).filter(Boolean),
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

// ── Catálogo de filamentos ──

export async function saveCatalogFilament(form: FormData) {
  await requireAdmin();
  const id = text(form, "id");
  const row = {
    brand: text(form, "brand"),
    material: text(form, "material"),
    color_name: text(form, "color_name"),
    color_hex: text(form, "color_hex") || "#9A9AA8",
    image_url: form.getAll("images").map(String).filter(Boolean)[0] ?? null,
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
