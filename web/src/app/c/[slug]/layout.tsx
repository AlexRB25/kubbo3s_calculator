import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCatalog, whatsappUrl } from "@/lib/catalog";
import { catalogBase } from "@/lib/catalog-base";

/** A seller's public catalog: their name and contact, not the Kubbo3D site around it. */
export default async function CatalogLayout({ children, params }: LayoutProps<"/c/[slug]">) {
  const { slug } = await params;
  const catalog = await loadCatalog(slug);
  if (!catalog) notFound();
  const base = await catalogBase(slug);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href={base || "/"} className="text-xl font-black tracking-wide">
            {catalog.title}
          </Link>
          {catalog.whatsapp && (
            <a href={whatsappUrl(catalog.whatsapp, "Hola, vi tu catálogo y tengo una pregunta.")} target="_blank" rel="noopener noreferrer" className="btn">
              WhatsApp
            </a>
          )}
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted">
          © {new Date().getFullYear()} {catalog.title} · Catálogo hecho con{" "}
          {process.env.SITE_URL ? (
            <a href={process.env.SITE_URL} className="hover:text-white">
              Kubbo3D
            </a>
          ) : (
            "Kubbo3D"
          )}
        </p>
      </footer>
    </div>
  );
}
