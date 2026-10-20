import Image from "next/image";
import Link from "next/link";
import { lowestPrice, type CatalogProduct } from "@/lib/catalog";
import { money } from "@/lib/format";
import { imageUrl } from "@/lib/supabase";

/** A product in a workshop's catalog. Without `href` it is only a preview (the Mi catálogo page). */
export function CatalogCard({ product, href }: { product: CatalogProduct; href?: string }) {
  const photo = imageUrl(product.image_path);
  const price = lowestPrice(product);
  const body = (
    <>
      <div className="relative aspect-square bg-raised">
        {photo ? (
          <Image src={photo} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover transition group-hover:scale-105" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-muted">Sin foto</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-medium">{product.name}</span>
        {product.categories.length > 0 && <span className="line-clamp-1 text-xs text-muted">{product.categories.join(" · ")}</span>}
        {price != null && (
          <span className="mt-auto text-sm text-muted">
            {product.links.filter((link) => link.price != null).length > 1 ? "desde " : ""}
            <strong className="text-lg tabular-nums text-white">{money(price)}</strong>
          </span>
        )}
      </div>
    </>
  );
  const style = "group flex flex-col overflow-hidden rounded-xl border border-line bg-panel transition";
  return href ? (
    <Link href={href} className={`${style} hover:border-brand`}>
      {body}
    </Link>
  ) : (
    <div className={style}>{body}</div>
  );
}
