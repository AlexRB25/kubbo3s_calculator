import Image from "next/image";
import Link from "next/link";
import { money } from "@/lib/format";
import { makerName, mediaUrl, type ModelCard } from "@/lib/market";

export function ModelCardView({ model }: { model: ModelCard }) {
  return (
    <Link href={`/modelos/${model.id}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel transition hover:border-brand">
      <div className="relative aspect-square bg-raised">
        {model.images[0] && (
          <Image src={mediaUrl(model.images[0])} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover transition group-hover:scale-105" />
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold ${Number(model.price) > 0 ? "bg-ink/85 text-white" : "bg-money text-ink"}`}
        >
          {Number(model.price) > 0 ? money(model.price) : "Gratis"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-medium">{model.title}</span>
        <span className="truncate text-xs text-muted">{makerName(model.makers)}</span>
        <span className="mt-auto flex flex-wrap gap-x-3 pt-1 text-xs tabular-nums text-muted">
          {model.rating_count > 0 && <span title="Calificación">★ {Number(model.rating_avg).toFixed(1)}</span>}
          <span title="Descargas">⬇ {model.downloads}</span>
          <span title="Guardado en favoritos">♥ {model.likes}</span>
        </span>
      </div>
    </Link>
  );
}
