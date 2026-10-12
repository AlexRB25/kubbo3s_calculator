"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!process.env.PB_SUPABASE_URL) {
      setError("Falta configurar Supabase en .env.local.");
      return;
    }
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError("");
    const { error } = await browserClient().auth.signInWithPassword({ email: form.email, password: form.password });
    if (error) {
      setError("Correo o contraseña incorrectos.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card flex w-full max-w-sm flex-col gap-4">
        <h1>
          KUBBO<span className="text-brand">3D</span> · Dashboard
        </h1>
        <p className="-mt-2 text-sm text-muted">
          Solo entran los correos listados en ADMIN_EMAILS. Si entras con otro, volverás a esta pantalla.
        </p>
        <label className="label">
          Correo
          <input name="email" type="email" className="input" autoComplete="email" required />
        </label>
        <label className="label">
          Contraseña
          <input name="password" type="password" className="input" autoComplete="current-password" required />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-bad/15 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Un momento…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
