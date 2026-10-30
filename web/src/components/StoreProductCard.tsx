import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/Price";
import type { StoreProduct } from "@/lib/store";

export function StoreProductCard({ product }: { product: StoreProduct }) {
  return (
    <Link
      href={`/tienda/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel transition hover:border-brand"
    >
      <div className="relative aspect-square bg-raised">
        {product.images[0] && (
          <Image
            src={product.images[0]}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-cover transition group-hover:scale-105"
          />
        )}
        {product.stock <= 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-xs font-semibold text-muted">Agotado</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-medium">{product.name}</span>
        <span className="mt-auto flex items-baseline gap-2">
          <strong className="text-lg tabular-nums"><Price mxn={product.price} /></strong>
          {product.compare_price != null && product.compare_price > product.price && (
            <s className="text-xs tabular-nums text-muted"><Price mxn={product.compare_price} /></s>
          )}
        </span>
      </div>
    </Link>
  );
}
