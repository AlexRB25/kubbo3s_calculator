"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MarketPanel } from "@/components/market/Panel";
import { money } from "@/lib/format";
import { mediaUrl, type Model } from "@/lib/market";
import { supabase } from "@/lib/supabase";

type Row = Pick<Model, "id" | "title" | "price" | "images" | "status" | "blocked" | "blocked_reason" | "downloads" | "sales" | "likes" | "comments" | "rating_avg" | "rating_count">;

export default function MyModelsPage() {
  return <MarketPanel title="Mis modelos">{(session) => <MyModels userId={session.user.id} />}</MarketPanel>;
}

function MyModels({ userId }: { userId: string }) {
  const [models, setModels] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase()
      .from("models")
      .select("id, title, price, images, status, blocked, blocked_reason, downloads, sales, likes, comments, rating_avg, rating_count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message);
        setModels(data ?? []);
      });
  }, [userId]);

  if (!models) return <p className="text-muted">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Sube tus STL o 3MF, gratis o con precio. Por cada venta te queda el precio menos la comisión de Kubbo; lo retiras desde Ventas y retiros.
        </p>
        <Link href="/modelos/panel/editar" className="btn btn-primary">
          + Subir modelo
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {models.length === 0 ? (
        <p className="card text-center text-muted">Todavía no subes modelos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-panel">
          {models.map((model) => (
            <li key={model.id} className="flex flex-wrap items-center gap-4 p-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-raised">
                {model.images[0] && <Image src={mediaUrl(model.images[0])} alt="" fill sizes="64px" className="object-cover" />}
              </div>
              <div className="min-w-48 flex-1">
                <p className="font-medium">{model.title}</p>
                <p className="text-xs text-muted">
                  {Number(model.price) > 0 ? money(model.price) : "Gratis"} · ⬇ {model.downloads} · {model.sales} ventas · ♥ {model.likes} · 💬 {model.comments}
                  {model.rating_count > 0 && ` · ★ ${Number(model.rating_avg).toFixed(1)}`}
                </p>
                {model.blocked && <p className="text-xs text-bad">Oculto por Kubbo{model.blocked_reason && `: ${model.blocked_reason}`}</p>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${model.status === "published" ? "bg-money/15 text-money" : "bg-raised text-muted"}`}>
                {model.status === "published" ? "Publicado" : "Borrador"}
              </span>
              {model.status === "published" && !model.blocked && (
                <Link href={`/modelos/${model.id}`} className="btn">
                  Ver
                </Link>
              )}
              <Link href={`/modelos/panel/editar?id=${model.id}`} className="btn">
                Editar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
