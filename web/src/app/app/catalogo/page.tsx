"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CatalogCard } from "@/components/CatalogCard";
import { Empty, PageHeader } from "@/components/app/ui";
import { SLUG, type CatalogProduct } from "@/lib/catalog";
import { useData, useSave } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type { Catalog, Channel, Product } from "@/lib/types";

const CATALOG_DOMAIN = process.env.PB_CATALOG_DOMAIN ?? "";
const CNAME = process.env.PB_CATALOG_CNAME ?? "";

/** "Taller Ñandú 3D" → "taller-nandu-3d". */
const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

/** "https://www.Tienda.com/x" → "tienda.com". */
const cleanDomain = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "");

/** The product as the public catalog shows it (same shape public_catalog() answers). */
function asCatalogProduct(product: Product, channels: Channel[], showPrices: boolean): CatalogProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    image_path: product.image_path,
    image_paths: product.image_paths ?? [],
    categories: product.categories ?? [],
    links: channels.flatMap((channel) => {
      const url = product.links?.[channel.id] ?? "";
      if (!/^https?:\/\//i.test(url)) return [];
      const price = Number(product.prices?.[channel.id] ?? 0);
      return [{ channel: channel.name, url, price: showPrices && price > 0 ? price : null }];
    }),
  };
}

function publicUrl(catalog: Catalog) {
  if (catalog.domain && catalog.domain_verified) return `https://${catalog.domain}`;
  if (CATALOG_DOMAIN) return `https://${catalog.slug}.${CATALOG_DOMAIN}`;
  return `${window.location.origin}/c/${catalog.slug}`;
}

/**
 * The workshop's public catalog: its products with photos, description, categories and the links to
 * where each one is sold. Published at /c/<address> (or the user's own domain once it is connected).
 */
export default function CatalogPage() {
  const [catalog, setCatalog] = useState<Catalog | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    supabase()
      .from("catalogs")
      .select("*")
      .maybeSingle()
      .then(({ data, error }) => (error ? setLoadError(error.message) : setCatalog(data)));
  }, []);

  if (loadError)
    return (
      <p role="alert" className="error">
        No se pudo cargar tu catálogo: {loadError}
      </p>
    );
  if (catalog === undefined) return <p className="text-muted">Cargando…</p>;

  return (
    <>
      <PageHeader title="Mi catálogo">
        {catalog?.published && (
          <a href={publicUrl(catalog)} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            Ver catálogo publicado ↗
          </a>
        )}
      </PageHeader>
      <p className="max-w-3xl text-sm text-muted">
        Una página con tus productos para compartir con tus clientes: al abrir uno ven sus fotos, descripción, categorías y botones a tus publicaciones en
        cada canal de venta. Nunca se muestran tus costos ni tu stock. Los enlaces se ponen al editar cada producto.
      </p>
      <CatalogSettings catalog={catalog} onSaved={setCatalog} />
      <CatalogPreview catalog={catalog} />
    </>
  );
}

function CatalogSettings({ catalog, onSaved }: { catalog: Catalog | null; onSaved: (catalog: Catalog) => void }) {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();
  const [slug, setSlug] = useState(catalog?.slug ?? slugify(profile?.business_name || profile?.name || ""));
  const [title, setTitle] = useState(catalog?.title ?? "");
  const [about, setAbout] = useState(catalog?.about ?? "");
  const [whatsapp, setWhatsapp] = useState(catalog?.whatsapp ?? "");
  const [showPrices, setShowPrices] = useState(catalog?.show_prices ?? true);
  const [published, setPublished] = useState(catalog?.published ?? false);
  const [domain, setDomain] = useState(catalog?.domain ?? "");
  const [saved, setSaved] = useState(false);
  const address = CATALOG_DOMAIN ? `${slug || "tu-taller"}.${CATALOG_DOMAIN}` : `${window.location.host}/c/${slug || "tu-taller"}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanSlug = slug.trim().toLowerCase();
    if (!SLUG.test(cleanSlug)) return setError("La dirección lleva de 2 a 40 letras sin acentos, números o guiones (sin espacios), por ejemplo mi-taller-3d.");
    let phone = whatsapp.replace(/\D/g, "");
    if (phone.length === 10) phone = `52${phone}`; // a Mexican number typed without the country code
    if (phone && (phone.length < 11 || phone.length > 15)) return setError("Escribe el WhatsApp con lada de país, por ejemplo 52 55 1234 5678.");
    const ownDomain = cleanDomain(domain);
    if (ownDomain && !/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(ownDomain)) return setError("El dominio no es válido. Ejemplo: tienda.midominio.com");
    if (ownDomain && CATALOG_DOMAIN && (ownDomain === CATALOG_DOMAIN || ownDomain.endsWith(`.${CATALOG_DOMAIN}`)))
      return setError(`Los dominios de ${CATALOG_DOMAIN} ya los da Kubbo3D: escribe un dominio tuyo.`);
    const row = { slug: cleanSlug, title: title.trim(), about: about.trim(), whatsapp: phone, show_prices: showPrices, published, domain: ownDomain || null };
    setSaved(false);
    let next: Catalog | null = null;
    save(
      async () => {
        const result = catalog
          ? await supabase().from("catalogs").update(row).eq("user_id", catalog.user_id).select().single()
          : await supabase().from("catalogs").insert(row).select().single();
        if (result.error?.message.includes("catalogs_slug_key")) return { error: { message: "Esa dirección ya la usa otro taller: elige otra." } };
        next = result.data;
        return result;
      },
      () => {
        setSlug(cleanSlug);
        setWhatsapp(phone);
        setDomain(ownDomain);
        setSaved(true);
        if (next) onSaved(next);
      },
    );
  }

  return (
    <form onSubmit={submit} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
      <label className="label">
        Dirección
        <input className="input" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))} required maxLength={40} />
        <span className="font-normal">{address}</span>
      </label>
      <label className="label">
        Nombre que se muestra
        <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder={profile?.business_name || "Mi taller 3D"} />
        <span className="font-normal">Vacío = el nombre de tu negocio.</span>
      </label>
      <label className="label sm:col-span-2">
        Sobre tu taller
        <textarea className="input" rows={3} value={about} onChange={(event) => setAbout(event.target.value)} maxLength={1000} placeholder="Qué haces, tiempos de entrega, pedidos personalizados…" />
      </label>
      <label className="label">
        WhatsApp (opcional)
        <input className="input" type="tel" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} maxLength={20} placeholder="52 55 1234 5678" />
        <span className="font-normal">Agrega un botón «Preguntar por WhatsApp» en cada producto.</span>
      </label>
      <div className="flex flex-col justify-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showPrices} onChange={(event) => setShowPrices(event.target.checked)} />
          Mostrar el precio de cada canal
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          Publicado (cualquiera con la dirección lo puede ver)
        </label>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-semibold">Tu propio dominio (opcional)</legend>
        <input className="input" value={domain} onChange={(event) => setDomain(event.target.value)} maxLength={253} placeholder="tienda.midominio.com" aria-label="Tu dominio" />
        {catalog?.domain && cleanDomain(domain) === catalog.domain ? (
          catalog.domain_verified ? (
            <p className="text-sm text-brand">Conectado: tu catálogo abre en https://{catalog.domain}</p>
          ) : (
            <p className="text-sm text-warn">
              Pendiente de conectar. En donde compraste tu dominio crea un registro <strong>CNAME</strong> de <strong>{catalog.domain.split(".")[0]}</strong> hacia{" "}
              <strong>{CNAME || "la dirección que te indique Kubbo3D"}</strong>. Cuando el DNS responda lo conectamos y aquí aparecerá «Conectado».
            </p>
          )
        ) : (
          <p className="text-xs text-muted">
            Usa un subdominio (tienda.tudominio.com): es el que se conecta con un registro CNAME. Al guardarlo te decimos qué poner en tu DNS.
          </p>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-sm text-brand sm:col-span-2">Guardado.</p>}
      <button className="btn btn-primary justify-self-start" disabled={busy}>
        {busy ? "Guardando…" : catalog ? "Guardar catálogo" : "Crear catálogo"}
      </button>
    </form>
  );
}

function CatalogPreview({ catalog }: { catalog: Catalog | null }) {
  const { products, channels, profile } = useData();
  const showPrices = catalog?.show_prices ?? true;
  const shown = products.filter((product) => product.in_catalog ?? true);
  const hidden = products.length - shown.length;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2>Vista previa</h2>
        <p className="text-sm text-muted">
          Qué productos salen se elige en Productos, con el switch «Catálogo».
          {hidden > 0 && ` ${hidden} ${hidden === 1 ? "producto está apagado" : "productos están apagados"}.`}
        </p>
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
        <div>
          <p className="text-xl font-black tracking-wide">{catalog?.title || profile?.business_name || "Mi taller 3D"}</p>
          {catalog?.about && <p className="mt-1 max-w-3xl whitespace-pre-line text-sm text-muted">{catalog.about}</p>}
        </div>
        {shown.length === 0 ? (
          <Empty>Ningún producto está en el catálogo. Da de alta productos o enciende su switch «Catálogo» en Productos.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((product) => {
              const item = asCatalogProduct(product, channels, showPrices);
              const missing = [!product.image_path && "sin foto", item.links.length === 0 && "sin enlaces a canales", !product.description && "sin descripción"].filter(Boolean);
              return (
                <div key={product.id} className="flex flex-col gap-2">
                  <CatalogCard product={item} />
                  {item.links.length > 0 && <p className="text-xs text-muted">{item.links.map((link) => link.channel).join(" · ")}</p>}
                  {missing.length > 0 && <p className="text-xs text-warn">{missing.join(", ")}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
