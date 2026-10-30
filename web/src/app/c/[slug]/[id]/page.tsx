import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/Gallery";
import { loadCatalog, whatsappUrl } from "@/lib/catalog";
import { catalogBase } from "@/lib/catalog-base";
import { moneyIn } from "@/lib/format";
import { imageUrl } from "@/lib/supabase";

async function find(params: PageProps<"/c/[slug]/[id]">["params"]) {
  const { slug, id } = await params;
  const catalog = await loadCatalog(slug);
  const product = catalog?.products.find((item) => item.id === id);
  return catalog && product ? { slug, catalog, product } : null;
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]/[id]">): Promise<Metadata> {
  const found = await find(params);
  if (!found) return { title: "Producto no encontrado" };
  const { catalog, product } = found;
  return {
    title: { absolute: `${product.name} · ${catalog.title}` },
    description: (product.description || product.name).slice(0, 160),
    openGraph: { title: product.name, images: product.image_path ? [imageUrl(product.image_path)!] : [] },
  };
}

export default async function CatalogProductPage({ params }: PageProps<"/c/[slug]/[id]">) {
  const found = await find(params);
  if (!found) notFound();
  const { slug, catalog, product } = found;
  const base = await catalogBase(slug);
  const photos = [product.image_path, ...product.image_paths].flatMap((path) => (path ? [imageUrl(path)!] : []));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href={base || "/"} className="text-sm text-muted hover:text-white">
        ← Todo el catálogo
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        {photos.length ? (
          <Gallery images={photos} name={product.name} />
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-xl border border-line bg-raised text-sm text-muted">Sin foto</div>
        )}
        <div className="flex flex-col gap-5">
          <h1 className="text-3xl">{product.name}</h1>
          {product.categories.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {product.categories.map((name) => (
                <li key={name}>
                  <Link href={`${base || "/"}?categoria=${encodeURIComponent(name)}`} className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-white">
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {product.links.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">Cómpralo en:</p>
              {product.links.map((link) => (
                <a
                  key={link.channel}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-lg flex items-center justify-between gap-3"
                >
                  <span>{link.channel} ↗</span>
                  {link.price != null && <span className="tabular-nums">{moneyIn(Number(link.price), catalog.currency ?? "MXN")}</span>}
                </a>
              ))}
            </div>
          )}
          {catalog.whatsapp && (
            <a
              href={whatsappUrl(catalog.whatsapp, `Hola, me interesa "${product.name}" de tu catálogo.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-lg"
            >
              Preguntar por WhatsApp
            </a>
          )}
          {product.description && <p className="whitespace-pre-line leading-relaxed text-muted">{product.description}</p>}
        </div>
      </div>
    </main>
  );
}
