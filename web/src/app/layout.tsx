import type { Metadata } from "next";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  // Social previews need absolute image URLs.
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: { default: "Kubbo3D · Tu taller de impresión 3D bajo control", template: "%s · Kubbo3D" },
  description:
    "Calcula el costo real de cada pieza, lleva tu filamento, tus impresiones y tus ventas en Mercado Libre y TikTok. Y compra filamento, impresoras e impresiones en nuestra tienda.",
  openGraph: { images: ["/brand/og.jpg"] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
