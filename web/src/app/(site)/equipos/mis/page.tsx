"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ListingForm } from "@/components/classifieds/ListingForm";
import { ListingPrice, SignInGate } from "@/components/classifieds/parts";
import { equipmentImage, type Listing } from "@/lib/classifieds";
import { day } from "@/lib/format";
import { supabase } from "@/lib/supabase";

const STATUS = { active: "Publicado", paused: "En pausa", sold: "Vendido" } as const;

export default function MyListingsPage() {
  return (
    <SignInGate back={{ href: "/equipos", label: "Equipos en venta" }} title="Mis anuncios de equipos" why="Entra con tu cuenta de Kubbo3D para ver y editar tus anuncios.">
      {(session) => <MyListings userId={session.user.id} />}
    </SignInGate>
  );
}

/** The user's listings: change their state (sold, paused), edit or delete them. */
function MyListings({ userId }: { userId: string }) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const { data, error: failed } = await supabase().from("equipment_listings").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setError(failed?.message ?? "");
    setListings((data ?? []) as Listing[]);
  }

  useEffect(() => {
    // Loads once the session is known; reloads after each change below.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function setStatus(listing: Listing, status: Listing["status"]) {
    const { error: failed } = await supabase().from("equipment_listings").update({ status, updated_at: new Date().toISOString() }).eq("id", listing.id);
    if (failed) return setError(failed.message);
    load();
  }

  async function remove(listing: Listing) {
    if (!window.confirm(`¿Borrar el anuncio «${listing.title}»? No se puede deshacer.`)) return;
    const { error: failed } = await supabase().from("equipment_listings").delete().eq("id", listing.id);
    if (failed) return setError(failed.message);
    if (listing.images.length) await supabase().storage.from("equipment").remove(listing.images);
    load();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <button className="btn self-start" onClick={() => setEditing(null)}>
          ← Volver a mis anuncios
        </button>
        <ListingForm
          userId={userId}
          listing={editing}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      </div>
    );
  }
  if (!listings) return <p className={error ? "error" : "text-muted"}>{error || "Cargando…"}</p>;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/equipos/publicar" className="btn btn-primary self-start">
        Publicar otro equipo
      </Link>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {listings.length === 0 && <p className="card text-muted">Todavía no publicas ningún equipo.</p>}
      {listings.map((listing) => {
        const cover = equipmentImage(listing.images[0]);
        return (
          <article key={listing.id} className="card flex flex-wrap items-center gap-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-raised">{cover && <Image src={cover} alt="" fill sizes="80px" className="object-cover" />}</div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={`/equipos/${listing.id}`} className="font-medium hover:text-brand">
                {listing.title}
              </Link>
              <ListingPrice price={Number(listing.price)} currency={listing.currency} className="text-sm font-semibold" />
              <p className="text-xs text-muted">
                {listing.blocked ? <span className="text-bad">Oculto por Kubbo3D</span> : STATUS[listing.status]} · {day(listing.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="input w-auto" value={listing.status} onChange={(event) => setStatus(listing, event.target.value as Listing["status"])} aria-label="Estado del anuncio">
                {Object.entries(STATUS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={() => setEditing(listing)}>
                Editar
              </button>
              <button className="btn btn-danger" onClick={() => remove(listing)}>
                Borrar
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
