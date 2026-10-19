import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { requireAdmin } from "@/lib/auth";
import { admin } from "@/lib/supabase/admin";

const LINKS = [
  { href: "/", label: "Métricas" },
  { href: "/usuarios", label: "Usuarios" },
  { href: "/suscripciones", label: "Suscripciones" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/reportes", label: "Reportes de problemas" },
  { href: "/tienda", label: "Tienda: productos" },
  { href: "/ajustes", label: "Tienda: ajustes" },
  { href: "/filamentos", label: "Catálogo de filamentos" },
  { href: "/impresoras", label: "Catálogo de impresoras" },
];

// Every page here reads live data with the admin's session: never prerender them at build time.
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const email = await requireAdmin();
  const { count: pending } = await admin()
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const { count: newReports } = await admin().from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "new");

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-1 border-line p-4 md:w-56 md:border-r">
        <p className="mb-3 flex items-center gap-2 px-3 text-lg font-black tracking-wide">
          <Image src="/brand/logo.png" alt="" width={28} height={28} priority />
          KUBBO<span className="text-brand">3D</span>
        </p>
        <nav className="flex flex-wrap gap-1 md:flex-col">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-raised hover:text-white"
            >
              {link.label}
              {link.href === "/pedidos" && !!pending && (
                <span className="rounded-full bg-warn px-2 text-xs font-bold text-ink">{pending}</span>
              )}
              {link.href === "/reportes" && !!newReports && (
                <span className="rounded-full bg-warn px-2 text-xs font-bold text-ink">{newReports}</span>
              )}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="mt-auto flex flex-col gap-2 px-3 pt-6">
          <p className="truncate text-xs text-muted">{email}</p>
          <button className="btn">Salir</button>
        </form>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">{children}</main>
    </div>
  );
}