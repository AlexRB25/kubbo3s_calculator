import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} Kubbo3D</span>
          <nav className="flex gap-5">
            <Link href="/modelos" className="hover:text-white">
              Modelos 3D
            </Link>
            <Link href="/tienda" className="hover:text-white">
              Tienda
            </Link>
            <Link href="/entrar" className="hover:text-white">
              Entrar a mi taller
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
