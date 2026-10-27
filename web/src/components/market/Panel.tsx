"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";

const LINKS = [
  { href: "/modelos/panel", label: "Mis modelos" },
  { href: "/modelos/panel/ventas", label: "Ventas y retiros" },
  { href: "/modelos/panel/perfil", label: "Mi perfil público" },
  { href: "/modelos/biblioteca", label: "Mi biblioteca" },
] as const;

/** Frame of the seller's and buyer's pages: asks to sign in first, then shows the section tabs. */
export function MarketPanel({ title, children }: { title: string; children: (session: Session) => ReactNode }) {
  const { session, loading } = useSession();
  const pathname = usePathname();

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <Link href="/modelos" className="text-sm text-muted hover:text-white">
        ← Modelos 3D
      </Link>
      <nav className="flex gap-2 overflow-x-auto border-b border-line" aria-label="Secciones">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-white aria-[current=true]:border-brand aria-[current=true]:text-white"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <h1 className="text-2xl">{title}</h1>
      {loading ? (
        <p className="text-muted">Cargando…</p>
      ) : session ? (
        children(session)
      ) : (
        <div className="card flex max-w-md flex-col gap-3">
          <p>Entra con tu cuenta de Kubbo3D (es gratis) para vender modelos, ver tus compras y tus favoritos.</p>
          <Link href={`/entrar?next=${encodeURIComponent(pathname)}`} className="btn btn-primary self-start">
            Entrar o crear cuenta
          </Link>
        </div>
      )}
    </main>
  );
}
