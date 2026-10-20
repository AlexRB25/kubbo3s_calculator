import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogCard } from "@/components/CatalogCard";
import { catalogCategories, loadCatalog } from "@/lib/catalog";
import { catalogBase } from "@/lib/catalog-base";
import { imageUrl } from "@/lib/supabase";

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const catalog = await loadCatalog((await params).slug);
  if (!catalog) return { title: "Catálogo no encontrado" };
  const cover = catalog.products.find((product) => product.image_path)?.image_path ?? null;
  return {
    title: { absolute: catalog.title },
    description: (catalog.about || `Catálogo de ${catalog.title}`).slice(0, 160),
    openGraph: { title: catalog.title, images: cover ? [imageUrl(cover)!] : [] },
  };
}

export default async function CatalogPage({ params, searchParams }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const catalog = await loadCatalog(slug);
  if (!catalog) notFound();
  const base = await catalogBase(slug);
  const picked = (await searchParams).categoria;
  const category = typeof picked === "string" ? picked : "";
  const categories = catalogCategories(catalog.products);
  const shown = category ? catalog.products.filter((product) => product.categories.includes(category)) : catalog.products;
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? "border-brand text-brand" : "border-line text-muted hover:text-white"}`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      {catalog.about && <p className="max-w-3xl whitespace-pre-line text-muted">{catalog.about}</p>}
      {categories.length > 1 && (
        <nav aria-label="Categorías" className="flex flex-wrap gap-2">
          <Link href={base || "/"} className={chip(!category)}>
            Todo
          </Link>
          {categories.map((name) => (
            <Link key={name} href={`${base || "/"}?categoria=${encodeURIComponent(name)}`} className={chip(name === category)}>
              {name}
            </Link>
          ))}
        </nav>
      )}
      {shown.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((product) => (
            <CatalogCard key={product.id} product={product} href={`${base}/${product.id}`} />
          ))}
        </div>
      ) : (
        <p className="text-muted">Todavía no hay productos aquí.</p>
      )}
    </main>
  );
}
