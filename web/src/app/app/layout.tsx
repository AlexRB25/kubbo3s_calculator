"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { NavIcon, type NavIconName } from "@/components/app/NavIcon";
import { DataProvider, useData } from "@/lib/data";
import type { ShopRole } from "@/lib/types";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/** Who sees each page (empty = everyone): staff do the daily work; settings and team are the owner's. */
const LINKS: { href: string; label: string; icon: NavIconName; roles?: ShopRole[] }[] = [
  { href: "/app", icon: "resumen", label: "Resumen" },
  { href: "/app/inventario", icon: "inventario", label: "Inventario" },
  { href: "/app/productos", icon: "productos", label: "Productos" },
  { href: "/app/catalogo", icon: "catalogo", label: "Mi catálogo", roles: ["owner", "admin"] },
  { href: "/app/filamento", icon: "filamento", label: "Filamento" },
  { href: "/app/insumos", icon: "insumos", label: "Insumos" },
  { href: "/app/impresiones", icon: "impresiones", label: "Impresiones" },
  { href: "/app/ventas", icon: "ventas", label: "Ventas" },
  { href: "/app/gastos", icon: "gastos", label: "Gastos" },
  { href: "/app/embalaje", icon: "embalaje", label: "Embalaje" },
  { href: "/app/paqueterias", icon: "paqueterias", label: "Paqueterías", roles: ["owner", "admin"] },
  { href: "/app/archivos", icon: "archivos", label: "Mis archivos" },
  { href: "/app/impresoras", icon: "impresoras", label: "Impresoras" },
  { href: "/app/proveedores", icon: "proveedores", label: "Proveedores", roles: ["owner", "admin"] },
  { href: "/app/canales", icon: "canales", label: "Canales de venta", roles: ["owner", "admin"] },
  { href: "/app/equipo", icon: "equipo", label: "Equipo" },
  { href: "/app/ajustes", icon: "ajustes", label: "Ajustes", roles: ["owner"] },
];

const ROLE_NAMES: Record<ShopRole, string> = { owner: "Dueño", admin: "Administrador", staff: "Colaborador" };

/** The pages this role sees. */
function useLinks() {
  const { shop } = useData();
  const role = shop?.role ?? "owner";
  return LINKS.filter((link) => !link.roles || link.roles.includes(role));
}

/** The sidebar of wide screens. */
function Nav({ pathname }: { pathname: string }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {useLinks().map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-raised hover:text-white aria-[current=page]:bg-brand/15 aria-[current=page]:text-brand"
        >
          <NavIcon name={link.icon} size={18} />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** The other Kubbo3D sites, as cards. */
function Extras({ onGo }: { onGo?: () => void }) {
  const items: { href: string; external?: boolean; icon: NavIconName; title: string; text: string }[] = [
    ...(process.env.PB_TOOLS_URL
      ? [{ href: process.env.PB_TOOLS_URL, external: true, icon: "herramientas" as const, title: "Herramientas 3D", text: "Moldes, cortadores, alcancías y lámparas" }]
      : []),
    { href: "/modelos", icon: "modelos", title: "Modelos 3D", text: "Compra y vende STL y 3MF" },
    { href: "/tienda", icon: "tienda", title: "Tienda Kubbo", text: "Lo que vendemos en Kubbo3D" },
  ];
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const body = (
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
              <NavIcon name={item.icon} size={18} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-white">{item.title}</span>
              <span className="truncate text-xs text-muted">{item.text}</span>
            </span>
            <span className="ml-auto text-muted">→</span>
          </>
        );
        const className = "flex items-center gap-3 rounded-xl border border-line bg-raised/40 p-2.5 transition hover:border-brand/60 hover:bg-raised";
        return item.external ? (
          <a key={item.href} href={item.href} className={className} onClick={onGo}>
            {body}
          </a>
        ) : (
          <Link key={item.href} href={item.href} className={className} onClick={onGo}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

/** Phones: a bar with the current page and a menu that slides in from the right, the pages as tiles. */
function MobileMenu({ pathname, userId, email }: { pathname: string; userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const links = useLinks();
  const current = links.find((link) => link.href === pathname) ?? links.find((link) => link.href !== "/app" && pathname.startsWith(link.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // The page behind does not scroll while the menu is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/app" className="flex shrink-0 items-center gap-2 text-base font-black tracking-wide">
          <Image src="/brand/logo.png" alt="" width={24} height={24} priority />
          KUBBO<span className="text-brand">3D</span>
        </Link>
        {current && <span className="min-w-0 truncate text-sm text-muted">· {current.label}</span>}
        <button
          type="button"
          className="ml-auto grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-raised text-white"
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <NavIcon name="menu" size={22} />
        </button>
      </header>

      <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`} inert={!open}>
        <div className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={close} />
        <aside
          role="dialog"
          aria-modal
          aria-label="Menú"
          className={`absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col gap-5 overflow-y-auto border-l border-line bg-ink p-4 shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">Tu taller</span>
            <button type="button" className="grid size-10 place-items-center rounded-xl border border-line bg-raised" aria-label="Cerrar menú" onClick={close}>
              <NavIcon name="cerrar" size={20} />
            </button>
          </div>
          <ShopSwitcher userId={userId} />
          <nav className="grid grid-cols-3 gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                aria-current={link === current ? "page" : undefined}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-raised/50 p-2 text-center text-xs leading-tight font-medium text-white transition active:scale-95 aria-[current=page]:border-brand aria-[current=page]:bg-brand/15 aria-[current=page]:text-brand"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
                  <NavIcon name={link.icon} size={22} />
                </span>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Más de Kubbo3D</p>
            <Extras onGo={close} />
          </div>
          <div className="mt-auto flex items-center gap-3 border-t border-line pt-4">
            <p className="min-w-0 flex-1 truncate text-xs text-muted">{email}</p>
            <button className="btn flex items-center gap-2" onClick={() => supabase().auth.signOut()}>
              <NavIcon name="salir" size={16} />
              Salir
            </button>
          </div>
        </aside>
      </div>
    </>
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
      <MobileMenu pathname={pathname} userId={session.user.id} email={session.user.email ?? ""} />
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line p-4 md:flex">
          <Link href="/" className="mb-3 flex items-center gap-2 px-3 text-lg font-black tracking-wide">
            <Image src="/brand/logo.png" alt="" width={28} height={28} priority />
            KUBBO<span className="text-brand">3D</span>
          </Link>
          <ShopSwitcher userId={session.user.id} />
          <Nav pathname={pathname} />
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <Extras />
            <p className="truncate px-1 text-xs text-muted">{session.user.email}</p>
            <button className="btn flex items-center justify-center gap-2" onClick={() => supabase().auth.signOut()}>
              <NavIcon name="salir" size={16} />
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
