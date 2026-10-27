"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

/**
 * Where the Kubbo3D mobile app opens a page of this site (the 3D models marketplace): it brings a one-time sign-in link (made by the calculator's
 * server for the signed-in user) after the "#", so it never reaches any server log. This page signs in
 * with it, its own session apart from the app's, and goes to that page.
 */
export default function AppSignInPage() {
  const router = useRouter();
  const [error, setError] = useState(supabaseConfigured ? "" : "Falta configurar Supabase en este sitio.");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token_hash") ?? "";
    const wanted = params.get("next") ?? "/";
    // Only paths inside this site.
    const next = wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : "/";
    // Take the token out of the address bar and the history right away.
    window.history.replaceState(null, "", window.location.pathname);
    if (!supabaseConfigured) return;
    if (!token) {
      router.replace(next);
      return;
    }
    supabase()
      .auth.verifyOtp({ token_hash: token, type: "email" })
      .then(({ error }) => {
        if (error) setError("El enlace ya se usó o caducó. Vuelve a abrirlo desde la app.");
        else router.replace(next);
      });
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <p role="alert" className="error max-w-sm">
            {error}
          </p>
          <Link href="/entrar" className="btn">
            Entrar con mi correo
          </Link>
        </>
      ) : (
        <p className="text-muted">Abriendo…</p>
      )}
    </main>
  );
}
