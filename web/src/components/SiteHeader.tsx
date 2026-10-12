"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { useSession } from "@/lib/session";

export function SiteHeader() {
  const { session } = useSession();
  const pieces = useCart().reduce((total, line) => total + line.quantity, 0);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-wide">
          <Image src="/brand/logo.png" alt="" width={32} height={32} priority />
          KUBBO<span className="text-brand">3D</span>
        </Link>
        <nav className="flex flex-1 items-center gap-5 text-sm font-medium text-muted">
          <Link href="/#funciones" className="hover:text-white">
            Funciones
          </Link>
          <Link href="/tienda" className="hover:text-white">
            Tienda
          </Link>
        </nav>
        <Link href="/carrito" className="btn" aria-label={`Carrito, ${pieces} piezas`}>
          Carrito
          {pieces > 0 && <span className="rounded-full bg-brand px-2 text-xs font-bold text-ink">{pieces}</span>}
        </Link>
        <Link href={session ? "/app" : "/entrar"} className="btn btn-primary">
          {session ? "Mi taller" : "Entrar"}
        </Link>
      </div>
    </header>
  );
}
