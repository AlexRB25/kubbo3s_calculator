"use client";

import { useState, type FormEvent } from "react";
import { CONDITIONS, EQUIPMENT_CATEGORIES, cleanWhatsapp, equipmentImage, uploadEquipmentImage, type Listing } from "@/lib/classifieds";
import { CURRENCIES, type Currency } from "@/lib/currency";
import { useDisplayCurrency } from "@/lib/display-currency";
import { num } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type Photo = { key: string; path?: string; file?: File; url: string };

const MAX_PHOTOS = 8;

/** Publishes or edits a piece of equipment for sale: what it is, its state, price, photos and how to reach the seller. */
export function ListingForm({ userId, listing, onDone }: { userId: string; listing?: Listing; onDone: (id: string) => void }) {
  const shown = useDisplayCurrency();
  const [category, setCategory] = useState<string>(listing?.category ?? "printer");
  const [title, setTitle] = useState(listing?.title ?? "");
  const [brand, setBrand] = useState(listing?.brand ?? "");
  const [model, setModel] = useState(listing?.model ?? "");
  const [condition, setCondition] = useState<string>(listing?.condition ?? "used");
  const [price, setPrice] = useState(listing ? String(listing.price) : "");
  const [currency, setCurrency] = useState<Currency>(listing?.currency ?? shown);
  const [description, setDescription] = useState(listing?.description ?? "");
  const [includes, setIncludes] = useState(listing?.includes ?? "");
  const [city, setCity] = useState(listing?.city ?? "");
  const [state, setState] = useState(listing?.state ?? "");
  const [country, setCountry] = useState(listing?.country ?? "México");
  const [whatsapp, setWhatsapp] = useState(listing?.whatsapp ?? "");
  const [freeShipping, setFreeShipping] = useState(listing?.free_shipping ?? false);
  const [shippingNote, setShippingNote] = useState(listing?.shipping_note ?? "");
  const [photos, setPhotos] = useState<Photo[]>(() => (listing?.images ?? []).map((path) => ({ key: path, path, url: equipmentImage(path)! })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function addPhotos(files: FileList | null) {
    const added = [...(files ?? [])].map((file) => ({ key: `${file.name}-${file.lastModified}-${Math.random()}`, file, url: URL.createObjectURL(file) }));
    setPhotos((list) => [...list, ...added].slice(0, MAX_PHOTOS));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const number = cleanWhatsapp(whatsapp);
    if (title.trim().length < 3) return setError("Escribe qué vendes (por ejemplo «Bambu Lab A1 mini con AMS lite»).");
    if (!(num(price) >= 0) || price.trim() === "") return setError("Escribe el precio.");
    if (!number) return setError("Escribe tu WhatsApp con lada del país, de 10 a 15 dígitos (por ejemplo 52 1 55 1234 5678).");
    if (!photos.length) return setError("Sube al menos una foto del equipo.");
    setBusy(true);
    const paths: string[] = [];
    for (const photo of photos) {
      if (photo.path) {
        paths.push(photo.path);
        continue;
      }
      const upload = await uploadEquipmentImage(userId, photo.file!);
      if (upload.error) {
        setBusy(false);
        return setError(`No se pudo subir la foto: ${upload.error.message}`);
      }
      paths.push(upload.path);
    }
    const row = {
      category,
      title: title.trim(),
      brand: brand.trim(),
      model: model.trim(),
      condition,
      price: Math.round(num(price) * 100) / 100,
      currency,
      description: description.trim(),
      includes: includes.trim(),
      images: paths,
      city: city.trim(),
      state: state.trim(),
      country: country.trim(),
      whatsapp: number,
      free_shipping: freeShipping,
      shipping_note: shippingNote.trim(),
    };
    const result = listing
      ? await supabase().from("equipment_listings").update({ ...row, updated_at: new Date().toISOString() }).eq("id", listing.id).select("id").single()
      : await supabase().from("equipment_listings").insert(row).select("id").single();
    if (result.error) {
      setBusy(false);
      return setError(result.error.message);
    }
    // Photos taken out leave the storage too.
    const dropped = (listing?.images ?? []).filter((path) => !paths.includes(path));
    if (dropped.length) await supabase().storage.from("equipment").remove(dropped);
    setBusy(false);
    onDone(result.data.id);
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-2">
      <label className="label sm:col-span-2">
        ¿Qué vendes?
        <input className="input" maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Bambu Lab A1 mini con AMS lite" required />
      </label>
      <label className="label">
        Tipo de equipo
        <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
          {EQUIPMENT_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Estado
        <select className="input" value={condition} onChange={(event) => setCondition(event.target.value)}>
          {CONDITIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Marca
        <input className="input" maxLength={60} value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Bambu Lab, Creality, Elegoo…" />
      </label>
      <label className="label">
        Modelo
        <input className="input" maxLength={80} value={model} onChange={(event) => setModel(event.target.value)} placeholder="A1 mini, K1 Max, Saturn 3…" />
      </label>
      <label className="label">
        Precio
        <span className="flex gap-2">
          <input className="input min-w-0 flex-1" type="number" min={0} step="any" value={price} onChange={(event) => setPrice(event.target.value)} required />
          <select className="input w-auto" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} aria-label="Moneda">
            {CURRENCIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </span>
      </label>
      <label className="label">
        Tu WhatsApp (con lada del país)
        <input className="input" inputMode="tel" maxLength={25} value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="52 1 55 1234 5678" required />
        <span className="font-normal">Los interesados te escriben aquí. Se muestra en la publicación.</span>
      </label>
      <label className="label sm:col-span-2">
        Descripción
        <textarea
          className="input"
          rows={5}
          maxLength={4000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Cómo funciona, horas de uso, por qué la vendes, fallas que tenga, si tiene garantía…"
        />
      </label>
      <label className="label sm:col-span-2">
        Qué incluye
        <textarea className="input" rows={3} maxLength={1000} value={includes} onChange={(event) => setIncludes(event.target.value)} placeholder="Placa PEI extra, 2 boquillas 0.4, 1 kg de PLA, caja original…" />
      </label>
      <label className="label">
        Ciudad
        <input className="input" maxLength={80} value={city} onChange={(event) => setCity(event.target.value)} />
      </label>
      <label className="label">
        Estado / provincia
        <input className="input" maxLength={80} value={state} onChange={(event) => setState(event.target.value)} />
      </label>
      <label className="label">
        País
        <input className="input" maxLength={60} value={country} onChange={(event) => setCountry(event.target.value)} />
      </label>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={freeShipping} onChange={(event) => setFreeShipping(event.target.checked)} />
          Incluye envío gratis
        </label>
        <input
          className="input"
          maxLength={200}
          value={shippingNote}
          onChange={(event) => setShippingNote(event.target.value)}
          placeholder={freeShipping ? "Envío gratis a todo México" : "Envío por cuenta del comprador, o entrega en persona"}
          aria-label="Notas del envío"
        />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <p className="text-sm font-medium">Fotos ({photos.length} de {MAX_PHOTOS}); la primera es la portada</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <div key={photo.key} className="relative size-24 overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- local previews (blob:) and storage photos */}
              <img src={photo.url} alt={`Foto ${index + 1}`} className="size-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/80 text-xs">
                <button type="button" className="px-2 py-1 disabled:opacity-30" disabled={index === 0} onClick={() => setPhotos((list) => [list[index], ...list.filter((_, at) => at !== index)])}>
                  Portada
                </button>
                <button type="button" className="px-2 py-1 text-bad" aria-label={`Quitar foto ${index + 1}`} onClick={() => setPhotos((list) => list.filter((_, at) => at !== index))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex size-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted hover:text-white">
              + Fotos
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => addPhotos(event.target.files)} />
            </label>
          )}
        </div>
      </div>

      <p className="text-xs text-muted sm:col-span-2">
        Kubbo3D solo muestra tu anuncio: el trato, el pago y el envío son entre tú y el comprador. No publiques equipos robados ni que no tengas; el anuncio se puede quitar.
      </p>
      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <button className="btn btn-primary self-start" disabled={busy}>
        {busy ? "Guardando…" : listing ? "Guardar cambios" : "Publicar"}
      </button>
    </form>
  );
}
