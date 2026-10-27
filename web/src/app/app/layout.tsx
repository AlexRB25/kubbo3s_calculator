"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DataProvider, useData } from "@/lib/data";
import type { ShopRole } from "@/lib/types";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/** Who sees each page (empty = everyone): staff do the daily work; settings and team are the owner's. */
const LINKS: { href: string; label: string; roles?: ShopRole[] }[] = [
  { href: "/app", label: "Resumen" },
  { href: "/app/inventario", label: "Inventario" },
  { href: "/app/productos", label: "Productos" },
  { href: "/app/catalogo", label: "Mi catálogo", roles: ["owner", "admin"] },
  { href: "/app/filamento", label: "Filamento" },
  { href: "/app/insumos", label: "Insumos" },
  { href: "/app/impresiones", label: "Impresiones" },
  { href: "/app/ventas", label: "Ventas" },
  { href: "/app/gastos", label: "Gastos" },
  { href: "/app/embalaje", label: "Embalaje" },
  { href: "/app/paqueterias", label: "Paqueterías", roles: ["owner", "admin"] },
  { href: "/app/archivos", label: "Mis archivos" },
  { href: "/app/impresoras", label: "Impresoras" },
  { href: "/app/proveedores", label: "Proveedores", roles: ["owner", "admin"] },
  { href: "/app/canales", label: "Canales de venta", roles: ["owner", "admin"] },
  { href: "/app/equipo", label: "Equipo" },
  { href: "/app/ajustes", label: "Ajustes", roles: ["owner"] },
];

const ROLE_NAMES: Record<ShopRole, string> = { owner: "Dueño", admin: "Administrador", staff: "Colaborador" };

/** The pages this role sees. */
function Nav({ pathname }: { pathname: string }) {
  const { shop } = useData();
  const role = shop?.role ?? "owner";
  return (
    <nav className="flex flex-wrap gap-1 md:flex-col">
      {LINKS.filter((link) => !link.roles || link.roles.includes(role)).map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
          className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-raised hover:text-white aria-[current=page]:bg-brand/15 aria-[current=page]:text-brand"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Which shop the user works in, when they belong to more than their own. */
function ShopSwitcher({ userId }: { userId: string }) {
  const { shop, reload } = useData();
  if (!shop || shop.shops.length < 2) return null;
  async function change(ownerId: string) {
    await supabase()
      .from("profiles")
      .update({ active_shop: ownerId === userId ? null : ownerId })
      .eq("id", userId);
    await reload();
  }
  return (
    <label className="mb-2 flex flex-col gap-1 px-3 text-xs text-muted">
      Tienda
      <select className="input py-1.5 text-sm" value={shop.shop_id} onChange={(event) => change(event.target.value)}>
        {shop.shops.map((item) => (
          <option key={item.owner_id} value={item.owner_id}>
            {item.name} · {ROLE_NAMES[item.role]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Holds the pages back until the user's data has loaded once. */
function Gate({ children }: { children: ReactNode }) {
  const { loading, error, profile, reload } = useData();
  if (loading) return <p className="text-muted">Cargando tu taller…</p>;
  if (!profile) {
    return (
      <div className="flex max-w-md flex-col gap-3">
        <p role="alert" className="error">
          {error || "Tu cuenta no tiene perfil. ¿Ya se ejecutó supabase/schema.sql en el proyecto?"}
        </p>
        <button className="btn" onClick={reload}>
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {children}
    </>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace(`/entrar?next=${encodeURIComponent(pathname)}`);
  }, [loading, session, router, pathname]);

  if (!session) return null;

  return (
    // Keyed by user so nothing from a previous account survives a change of session.
    <DataProvider key={session.user.id} userId={session.user.id}>
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col gap-1 border-line p-4 md:w-56 md:border-r">
          <Link href="/" className="mb-3 flex items-center gap-2 px-3 text-lg font-black tracking-wide">
            <Image src="/brand/logo.png" alt="" width={28} height={28} priority />
            KUBBO<span className="text-brand">3D</span>
          </Link>
          <ShopSwitcher userId={session.user.id} />
          <Nav pathname={pathname} />
          <div className="mt-auto flex flex-col gap-2 px-3 pt-6">
            {process.env.PB_TOOLS_URL && (
              <a href={process.env.PB_TOOLS_URL} className="text-sm text-muted hover:text-white">
                Herramientas 3D →
              </a>
            )}
            <Link href="/modelos" className="text-sm text-muted hover:text-white">
              Modelos 3D (STL) →
            </Link>
            <Link href="/tienda" className="text-sm text-muted hover:text-white">
              Tienda Kubbo →
            </Link>
            <p className="truncate text-xs text-muted">{session.user.email}</p>
            <button className="btn" onClick={() => supabase().auth.signOut()}>
              Salir
            </button>
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">
          <Gate>{children}</Gate>
        </main>
      </div>
    </DataProvider>
  );
}
