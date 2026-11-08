"use client";

import { useState } from "react";
import { useData } from "@/lib/data";
import { supabase } from "@/lib/supabase";

/** Deletes the user's account and all its data, after typing ELIMINAR. */
export function DeleteAccount() {
  const { shop } = useData();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owner = !shop || shop.role === "owner";

  async function remove() {
    setBusy(true);
    setError("");
    const { data } = await supabase().auth.getSession();
    const response = await fetch("/api/cuenta/eliminar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ confirm: typed.trim().toUpperCase() }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setBusy(false);
      return setError(result?.error ?? "No se pudo conectar. Revisa tu internet e inténtalo de nuevo.");
    }
    // Without a session the panel sends the user to the sign-in page by itself.
    await supabase().auth.signOut();
  }

  return (
    <div className="card flex max-w-2xl flex-col gap-3 border-bad/40">
      <div>
        <h2>Eliminar mi cuenta</h2>
        <p className="text-sm text-muted">
          Se borran para siempre tu cuenta y {owner ? "todo tu taller: productos, inventario, ventas, gastos, cotizaciones, clientes, archivos y tu tienda" : "tus datos"}. Tu plan se cancela
          y no se te vuelve a cobrar. No se puede deshacer.
        </p>
      </div>
      {!open ? (
        <button className="btn btn-danger self-start" onClick={() => setOpen(true)}>
          Eliminar mi cuenta
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="label">
            Escribe ELIMINAR para confirmar
            <input className="input max-w-60" value={typed} autoFocus onChange={(event) => setTyped(event.target.value)} />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-danger" disabled={busy || typed.trim().toUpperCase() !== "ELIMINAR"} onClick={remove}>
              {busy ? "Eliminando…" : "Eliminar para siempre"}
            </button>
            <button className="btn" disabled={busy} onClick={() => (setOpen(false), setTyped(""), setError(""))}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
