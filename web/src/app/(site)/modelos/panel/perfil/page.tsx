"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { MarketPanel } from "@/components/market/Panel";
import type { Maker } from "@/lib/market";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  return <MarketPanel title="Mi perfil público">{() => <Profile />}</MarketPanel>;
}

/** The name, @user and bio others see on models and comments. my_maker() creates it the first time. */
function Profile() {
  const [maker, setMaker] = useState<Maker | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    supabase()
      .rpc("my_maker")
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message);
        setMaker(data);
      });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const handle = maker!.handle.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(handle)) return setError("Tu @usuario lleva de 3 a 30 letras sin acentos, números o guion bajo.");
    const { error: failed } = await supabase()
      .from("makers")
      .update({ handle, name: maker!.name.trim(), bio: maker!.bio.trim(), country: maker!.country.trim() })
      .eq("user_id", maker!.user_id);
    if (failed) return setError(failed.code === "23505" ? "Ese @usuario ya lo tiene alguien más." : failed.message);
    setMaker({ ...maker!, handle });
    setNotice("Guardado.");
  }

  if (!maker) return <p className={error ? "error" : "text-muted"}>{error || "Cargando…"}</p>;
  const set = (change: Partial<Maker>) => setMaker({ ...maker, ...change });

  return (
    <form onSubmit={save} className="card flex max-w-xl flex-col gap-4">
      <label className="label">
        Nombre que se muestra
        <input className="input" maxLength={80} value={maker.name} onChange={(event) => set({ name: event.target.value })} placeholder="Tu nombre o el de tu estudio" />
      </label>
      <label className="label">
        @usuario
        <input className="input" maxLength={30} value={maker.handle} onChange={(event) => set({ handle: event.target.value })} />
      </label>
      <label className="label">
        País
        <input className="input" maxLength={60} value={maker.country} onChange={(event) => set({ country: event.target.value })} placeholder="México" />
      </label>
      <label className="label">
        Sobre ti
        <textarea className="input" rows={4} maxLength={500} value={maker.bio} onChange={(event) => set({ bio: event.target.value })} placeholder="Qué diseñas, tus redes…" />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-brand">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary">Guardar</button>
        <Link href={`/modelos/u/${maker.handle}`} className="btn">
          Ver mi perfil
        </Link>
      </div>
    </form>
  );
}
