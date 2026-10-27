"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { authErrorMessage, supabase, supabaseConfigured } from "@/lib/supabase";

function SignInForm() {
  const router = useRouter();
  const { session } = useSession();
  const params = useSearchParams();
  const [isRegister, setIsRegister] = useState(params.get("modo") === "registro");
  // Only paths inside this site, so the link cannot send people elsewhere after signing in.
  const wanted = params.get("next") ?? "/app";
  const next = wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : "/app";
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Also covers arriving here while already signed in.
  useEffect(() => {
    if (session) router.replace(next);
  }, [session, router, next]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supabaseConfigured) return setError("Falta configurar Supabase en .env.local.");
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;

    setBusy(true);
    const { data, error } = isRegister
      ? await supabase().auth.signUp({ email: form.email, password: form.password, options: { data: { name: form.name.trim() } } })
      : await supabase().auth.signInWithPassword({ email: form.email, password: form.password });
    setBusy(false);

    if (error) setError(authErrorMessage(error));
    else if (!data.session && data.user?.identities?.length === 0) setError("Ya existe una cuenta con ese correo.");
    else if (!data.session) {
      setNotice("Te enviamos un correo. Confirma tu cuenta y luego entra aquí.");
      setIsRegister(false);
    }
  }

  return (
    <form onSubmit={submit} className="card relative flex w-full max-w-sm flex-col gap-4">
      <Link href="/" className="flex items-center gap-2 self-center text-xl font-black tracking-wide">
        <Image src="/brand/logo.png" alt="" width={40} height={40} priority />
        KUBBO<span className="text-brand">3D</span>
      </Link>
      <h1 className="text-center text-xl">{isRegister ? "Crea tu cuenta" : "Entra a tu taller"}</h1>
      <p className="-mt-2 text-center text-sm text-muted">La misma cuenta funciona en la app móvil y en la web.</p>
      {isRegister && (
        <label className="label">
          Nombre
          <input name="name" className="input" autoComplete="name" required minLength={2} maxLength={40} />
        </label>
      )}
      <label className="label">
        Correo
        <input name="email" type="email" className="input" autoComplete="email" required />
      </label>
      <label className="label">
        Contraseña
        <input
          name="password"
          type="password"
          className="input"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={isRegister ? 8 : 1}
          maxLength={72}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">
          {notice}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? "Un momento…" : isRegister ? "Crear cuenta" : "Entrar"}
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          setIsRegister(!isRegister);
          setError("");
        }}
      >
        {isRegister ? "Ya tengo cuenta" : "Crear una cuenta"}
      </button>
    </form>
  );
}

export default function SignInPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="glow pointer-events-none absolute inset-0" aria-hidden />
      {/* useSearchParams needs a Suspense boundary to prerender the rest of the page. */}
      <Suspense>
        <SignInForm />
      </Suspense>
    </main>
  );
}
