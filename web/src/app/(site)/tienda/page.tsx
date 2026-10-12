import type { Metadata } from "next";
import Link from "next/link";
import { StoreProductCard } from "@/components/StoreProductCard";
import type { StoreCategory, StoreProduct } from "@/lib/store";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Tienda",
  description: "Impresiones 3D, filamento, impresoras y refacciones de Kubbo3D.",
};

export default async function StorePage({ searchParams }: PageProps<"/tienda">) {
  const params = await searchParams;
  const categorySlug = String(params.categoria ?? "");
  const query = String(params.q ?? "").trim();

  let categories: StoreCategory[] = [];
  let products: StoreProduct[] = [];
  let failed = !supabaseConfigured;
  if (supabaseConfigured) {
    const db = publicClient();
    categories = (await db.from("store_categories").select("*").order("sort").order("name")).data ?? [];
    const category = categories.find((item) => item.slug === categorySlug);

    let request = db.from("store_products").select("*").eq("active", true).order("featured", { ascending: false }).order("name");
    if (category) request = request.eq("category_id", category.id);
    // Only characters that can appear in a product name, so the pattern cannot be broken out of.
    const safe = query.replace(/[^\p{L}\p{N} .-]/gu, "");
    if (safe) request = request.ilike("name", `%${safe}%`);
    const result = await request;
    products = result.data ?? [];
    failed = Boolean(result.error);
  }

  const chip = "rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted hover:text-white aria-[current=true]:border-brand aria-[current=true]:bg-brand/15 aria-[current=true]:text-white";

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Tienda</h1>
          <p className="mt-1 text-muted">Impresiones, filamento, impresoras y refacciones.</p>
        </div>
        <form className="flex gap-2">
          {categorySlug && <input type="hidden" name="categoria" value={categorySlug} />}
          <input name="q" defaultValue={query} placeholder="Buscar producto" aria-label="Buscar producto" className="input w-56" />
          <button className="btn">Buscar</button>
        </form>
      </header>

      {categories.length > 0 && (
        <nav className="flex flex-wrap gap-2" aria-label="Categorías">
          <Link href="/tienda" aria-current={!categorySlug} className={chip}>
            Todo
          </Link>
          {categories.map((category) => (
            <Link key={category.id} href={`/tienda?categoria=${category.slug}`} aria-current={category.slug === categorySlug} className={chip}>
              {category.name}
            </Link>
          ))}
        </nav>
      )}

      {failed ? (
        <p className="error">No pudimos cargar la tienda. Inténtalo de nuevo en un momento.</p>
      ) : products.length === 0 ? (
        <p className="card text-center text-muted">
          {query || categorySlug ? "No hay productos con ese filtro." : "Muy pronto: estamos subiendo nuestros primeros productos."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <StoreProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}
