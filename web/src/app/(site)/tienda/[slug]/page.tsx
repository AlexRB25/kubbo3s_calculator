import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AddToCart } from "@/components/AddToCart";
import { Gallery } from "@/components/Gallery";
import { money } from "@/lib/format";
import type { StoreProduct } from "@/lib/store";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

// One query shared by generateMetadata and the page.
const findProduct = cache(async (slug: string): Promise<StoreProduct | null> => {
  if (!supabaseConfigured) return null;
  const { data } = await publicClient().from("store_products").select("*").eq("slug", slug).eq("active", true).maybeSingle();
  return data;
});

export async function generateMetadata({ params }: PageProps<"/tienda/[slug]">): Promise<Metadata> {
  const product = await findProduct((await params).slug);
  if (!product) return { title: "Producto no encontrado" };
  return {
    title: product.name,
    description: product.description.slice(0, 160),
    openGraph: product.images[0] ? { images: [product.images[0]] } : undefined,
  };
}

export default async function StoreProductPage({ params }: PageProps<"/tienda/[slug]">) {
  const product = await findProduct((await params).slug);
  if (!product) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/tienda" className="text-sm text-muted hover:text-white">
        ← Tienda
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <Gallery images={product.images} name={product.name} />
        <div className="flex flex-col gap-5">
          <h1 className="text-3xl">{product.name}</h1>
          <p className="flex items-baseline gap-3">
            <strong className="text-3xl tabular-nums">{money(product.price)}</strong>
            {product.compare_price != null && product.compare_price > product.price && (
              <s className="tabular-nums text-muted">{money(product.compare_price)}</s>
            )}
          </p>
          <AddToCart productId={product.id} stock={product.stock} />
          {product.description && <p className="whitespace-pre-line leading-relaxed text-muted">{product.description}</p>}
        </div>
      </div>
    </main>
  );
}
