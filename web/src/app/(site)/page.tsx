import Image from "next/image";
import Link from "next/link";
import { StoreProductCard } from "@/components/StoreProductCard";
import type { StoreProduct } from "@/lib/store";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

// Featured products come from the database, so the page is rendered per request.
export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "Costo real por pieza",
    text: "Filamento, luz, desgaste de la máquina y empaque. Sabes cuánto te cuesta antes de ponerle precio.",
  },
  {
    title: "Precio para cada canal",
    text: "Precio sugerido y ganancia en Mercado Libre, TikTok Shop o venta directa, ya descontadas comisiones y envío.",
  },
  {
    title: "Filamento al gramo",
    text: "Cada impresión descuenta lo que consumió. Te avisamos cuando un color está por acabarse.",
  },
  {
    title: "Impresiones y stock",
    text: "Registra qué mandaste a imprimir; las piezas buenas entran a tu inventario y las fallidas también cuentan.",
  },
  {
    title: "Ventas, gastos y ganancia",
    text: "Cuánto vendiste, cuánto gastaste y cuánto te quedó cada mes, sin hojas de cálculo.",
  },
  {
    title: "Mantenimiento de impresoras",
    text: "Historial de ajustes, reparaciones y servicios por máquina, con recordatorio del siguiente.",
  },
];

async function featuredProducts(): Promise<StoreProduct[]> {
  if (!supabaseConfigured) return [];
  const { data } = await publicClient()
    .from("store_products")
    .select("*")
    .eq("active", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(4);
  return data ?? [];
}

export default async function LandingPage() {
  const products = await featuredProducts();

  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="glow pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-20 text-center md:py-28">
          <Image src="/brand/logo.png" alt="Kubbo3D" width={128} height={128} priority className="drop-shadow-[0_0_30px_rgb(53_197_214/0.6)]" />
          <h1 className="text-glow text-4xl leading-tight md:text-6xl">Tu taller de impresión 3D, bajo control</h1>
          <p className="max-w-xl text-lg text-muted">
            Kubbo3D calcula cuánto te cuesta cada pieza, lleva tu filamento y tus impresiones, y te dice cuánto ganas en cada
            venta. En tu teléfono y en tu computadora, con la misma cuenta.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/entrar?modo=registro" className="btn btn-primary btn-lg">
              Crear mi cuenta
            </Link>
            <Link href="/tienda" className="btn btn-lg">
              Ver la tienda
            </Link>
          </div>
        </div>
      </section>

      <section id="funciones" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Todo lo que pasa en tu taller, en un solo lugar</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="card flex flex-col gap-2">
              <h3 className="font-semibold text-brand">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-panel">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-3xl font-bold">App y web, siempre sincronizadas</h2>
            <p className="text-muted">
              Registra una impresión desde el teléfono junto a la máquina y revisa tus números en la computadora. Es la misma
              cuenta y los mismos datos: lo que cambias en un lado aparece en el otro.
            </p>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              <li>
                <strong className="text-white">En el taller:</strong> manda a imprimir, descuenta filamento y registra ventas al momento.
              </li>
              <li>
                <strong className="text-white">En el escritorio:</strong> tablas completas de productos, precios por canal, gastos y ganancias.
              </li>
            </ul>
            <div>
              <Link href="/entrar" className="btn btn-primary">
                Abrir mi taller en la web
              </Link>
            </div>
          </div>
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-line bg-ink">
            <div className="glow absolute inset-0" aria-hidden />
            <span className="text-glow relative text-5xl font-black tracking-widest text-brand md:text-6xl">KUBBO</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold">Tienda Kubbo</h2>
            <p className="mt-1 text-muted">Impresiones, filamento, impresoras y refacciones que usamos nosotros.</p>
          </div>
          <Link href="/tienda" className="btn">
            Ver todo
          </Link>
        </div>
        {products.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {products.map((product) => (
              <StoreProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="card mt-8 text-center text-muted">Muy pronto: estamos subiendo nuestros primeros productos.</p>
        )}
      </section>
    </main>
  );
}
