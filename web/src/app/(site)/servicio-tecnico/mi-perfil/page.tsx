"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChipPicker, SignInGate } from "@/components/classifieds/parts";
import { TECH_MODES, TECH_SERVICES, cleanWhatsapp, equipmentImage, uploadEquipmentImage, type TechMode, type TechProvider, type TechService } from "@/lib/classifieds";
import { supabase } from "@/lib/supabase";

export default function TechProfilePage() {
  return (
    <SignInGate
      back={{ href: "/servicio-tecnico", label: "Servicio técnico" }}
      title="Mi perfil de técnico"
      why="Entra con tu cuenta de Kubbo3D (es gratis) para ofrecer tus servicios de reparación y mantenimiento."
    >
      {(session) => <TechProfile userId={session.user.id} />}
    </SignInGate>
  );
}

type Draft = Omit<TechProvider, "user_id" | "blocked" | "rating_avg" | "rating_count" | "created_at"> & { brandsText: string };

const EMPTY: Draft = {
  name: "",
  about: "",
  services: [],
  brands: [],
  brandsText: "",
  modes: ["workshop"],
  city: "",
  state: "",
  country: "México",
  whatsapp: "",
  photo_path: null,
  active: true,
};

/** Signs the user up as a technician, or edits their profile: services, brands, where they work and WhatsApp. */
function TechProfile({ userId }: { userId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [exists, setExists] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);

  useEffect(() => {
    supabase()
      .from("tech_providers")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message);
        setExists(Boolean(data));
        setDraft(data ? { ...(data as TechProvider), brandsText: (data as TechProvider).brands.join(", ") } : EMPTY);
      });
  }, [userId]);

  if (!draft) return <p className={error ? "error" : "text-muted"}>{error || "Cargando…"}</p>;
  const set = (change: Partial<Draft>) => setDraft({ ...draft, ...change });
  const shownPhoto = preview ?? equipmentImage(draft.photo_path);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const whatsapp = cleanWhatsapp(draft!.whatsapp);
    if (draft!.name.trim().length < 2) return setError("Escribe tu nombre o el de tu taller.");
    if (!draft!.services.length) return setError("Elige al menos un servicio.");
    if (!draft!.modes.length) return setError("Elige dónde das el servicio.");
    if (!whatsapp) return setError("Escribe tu WhatsApp con lada del país, de 10 a 15 dígitos.");
    setBusy(true);
    let photoPath = draft!.photo_path;
    if (photo) {
      const upload = await uploadEquipmentImage(userId, photo);
      if (upload.error) {
        setBusy(false);
        return setError(`No se pudo subir la foto: ${upload.error.message}`);
      }
      photoPath = upload.path;
    }
    const brands = [...new Set(draft!.brandsText.split(",").map((brand) => brand.trim()).filter(Boolean))].slice(0, 20);
    const row = {
      name: draft!.name.trim(),
      about: draft!.about.trim(),
      services: draft!.services,
      brands,
      modes: draft!.modes,
      city: draft!.city.trim(),
      state: draft!.state.trim(),
      country: draft!.country.trim(),
      whatsapp,
      photo_path: photoPath,
      active: draft!.active,
    };
    const { error: failed } = exists
      ? await supabase().from("tech_providers").update({ ...row, updated_at: new Date().toISOString() }).eq("user_id", userId)
      : await supabase().from("tech_providers").insert(row);
    setBusy(false);
    if (failed) return setError(failed.message);
    if (photo && draft!.photo_path && draft!.photo_path !== photoPath) await supabase().storage.from("equipment").remove([draft!.photo_path]);
    setPhoto(null);
    setExists(true);
    setDraft({ ...draft!, ...row, brandsText: brands.join(", ") });
    setNotice(exists ? "Guardado." : "¡Listo! Ya apareces en Servicio técnico.");
  }

  return (
    <form onSubmit={save} className="card flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-full bg-raised">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob:) or storage photo */}
          {shownPhoto && <img src={shownPhoto} alt="" className="size-full object-cover" />}
        </div>
        <label className="btn cursor-pointer">
          {shownPhoto ? "Cambiar foto o logo" : "Subir foto o logo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
        </label>
      </div>
      <label className="label">
        Nombre o taller
        <input className="input" maxLength={80} value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder="Taller 3D Monterrey" required />
      </label>
      <div className="label">
        Servicios que das
        <ChipPicker options={TECH_SERVICES} value={draft.services} onChange={(services: TechService[]) => set({ services })} />
      </div>
      <div className="label">
        Dónde das el servicio
        <ChipPicker options={TECH_MODES} value={draft.modes} onChange={(modes: TechMode[]) => set({ modes })} />
      </div>
      <label className="label">
        Marcas que atiendes
        <input className="input" maxLength={400} value={draft.brandsText} onChange={(event) => set({ brandsText: event.target.value })} placeholder="Bambu Lab, Creality, Prusa, Elegoo" />
        <span className="font-normal">Separadas por comas.</span>
      </label>
      <label className="label">
        Sobre tu servicio
        <textarea
          className="input"
          rows={5}
          maxLength={2000}
          value={draft.about}
          onChange={(event) => set({ about: event.target.value })}
          placeholder="Experiencia, qué reparas, tiempos de entrega, garantía, precios de referencia…"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="label">
          Ciudad
          <input className="input" maxLength={80} value={draft.city} onChange={(event) => set({ city: event.target.value })} />
        </label>
        <label className="label">
          Estado / provincia
          <input className="input" maxLength={80} value={draft.state} onChange={(event) => set({ state: event.target.value })} />
        </label>
        <label className="label">
          País
          <input className="input" maxLength={60} value={draft.country} onChange={(event) => set({ country: event.target.value })} />
        </label>
      </div>
      <label className="label">
        Tu WhatsApp (con lada del país)
        <input className="input" inputMode="tel" maxLength={25} value={draft.whatsapp} onChange={(event) => set({ whatsapp: event.target.value })} placeholder="52 1 81 1234 5678" required />
        <span className="font-normal">Los clientes te escriben aquí. Se muestra en tu perfil.</span>
      </label>
      {exists && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.active} onChange={(event) => set({ active: event.target.checked })} />
          Mostrar mi perfil en Servicio técnico (desmárcalo para ocultarlo un tiempo)
        </label>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-brand">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : exists ? "Guardar" : "Darme de alta"}
        </button>
        {exists && (
          <Link href={`/servicio-tecnico/${userId}`} className="btn">
            Ver mi perfil
          </Link>
        )}
      </div>
    </form>
  );
}
