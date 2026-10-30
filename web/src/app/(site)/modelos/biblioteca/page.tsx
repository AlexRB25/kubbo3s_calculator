"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ModelCardView } from "@/components/ModelCardView";
import { downloadLinks, type Signed } from "@/components/market/ModelActions";
import { MarketPanel } from "@/components/market/Panel";
import { Price } from "@/components/Price";
import { day } from "@/lib/format";
import { CARD_COLUMNS, type ModelCard } from "@/lib/market";
import { supabase } from "@/lib/supabase";

type Purchase = { id: string; model_id: string; title: string; price: number; paid_at: string };
type Library = { purchases: Purchase[]; downloads: ModelCard[]; favorites: ModelCard[] };

export default function LibraryPage() {
  return <MarketPanel title="Mi biblioteca">{(session) => <MyLibrary userId={session.user.id} />}</MarketPanel>;
}

/** What the user bought, downloaded for free and saved as favourite. */
function MyLibrary({ userId }: { userId: string }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const db = supabase();
    Promise.all([
      db.from("model_purchases").select("id, model_id, title, price, paid_at").eq("buyer_id", userId).eq("status", "paid").order("paid_at", { ascending: false }),
      db.from("model_downloads").select(`last_at, models(${CARD_COLUMNS})`).eq("user_id", userId).order("last_at", { ascending: false }).limit(200),
      db.from("model_favorites").select(`created_at, models(${CARD_COLUMNS})`).eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    ]).then(([bought, downloaded, saved]) => {
      const failed = bought.error ?? downloaded.error ?? saved.error;
      if (failed) setError(failed.message);
      // A model its author took down comes back as null: it is skipped (purchases keep their own title).
      const models = (rows: unknown[] | null) => (rows ?? []).map((row) => (row as { models: ModelCard | null }).models).filter((model): model is ModelCard => Boolean(model));
      setLibrary({ purchases: bought.data ?? [], downloads: models(downloaded.data), favorites: models(saved.data) });
    });
  }, [userId]);

  if (!library) return <p className={error ? "error" : "text-muted"}>{error || "Cargando…"}</p>;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2>Compras ({library.purchases.length})</h2>
        {library.purchases.length === 0 ? (
          <p className="text-sm text-muted">Todavía no compras modelos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-panel">
            {library.purchases.map((purchase) => (
              <li key={purchase.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{purchase.title}</p>
                  <p className="text-xs text-muted">
                    <Price mxn={purchase.price} /> · {day(purchase.paid_at)}
                  </p>
                </div>
                <Link href={`/modelos/${purchase.model_id}`} className="btn">
                  Ver
                </Link>
                <DownloadButton modelId={purchase.model_id} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <Grid title="Descargados" models={library.downloads} empty="Aún no descargas modelos gratis." />
      <Grid title="Favoritos" models={library.favorites} empty="Guarda modelos con ♡ para encontrarlos aquí." />
    </div>
  );
}

/** Downloads right here: a purchase stays downloadable even when its author unpublished the model. */
function DownloadButton({ modelId }: { modelId: string }) {
  const [links, setLinks] = useState<Signed[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const signed = await downloadLinks(modelId);
      setLinks(signed);
      if (signed.length === 1) window.location.assign(signed[0].url);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn btn-primary" onClick={download} disabled={busy}>
        {busy ? "Preparando…" : "Descargar"}
      </button>
      {error && <p className="text-xs text-bad">{error}</p>}
      {links.length > 1 &&
        links.map((link) => (
          <a key={link.url} href={link.url} className="text-xs text-brand hover:underline">
            ⬇ {link.name}
          </a>
        ))}
    </div>
  );
}

function Grid({ title, models, empty }: { title: string; models: ModelCard[]; empty: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2>
        {title} ({models.length})
      </h2>
      {models.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {models.map((model) => (
            <ModelCardView key={model.id} model={model} />
          ))}
        </div>
      )}
    </section>
  );
}
