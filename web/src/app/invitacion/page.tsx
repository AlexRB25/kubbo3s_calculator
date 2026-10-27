"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

type Info = { shop: string; email: string; role: "admin" | "staff"; accepted: boolean };
const ROLE_NAMES = { admin: "Administrador", staff: "Colaborador" };

/**
 * Where an invitation email lands. The email signs the person in (the session comes after the "#");
 * with it the page shows the shop and the role and accepts the invitation.
 */
function Invitation() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const { session, loading } = useSession();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const here = `/invitacion?token=${encodeURIComponent(token)}`;

  // Links from Supabase's emails bring the session in the address after "#": keep it and clear the address.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    if (!access || !refresh) return;
    window.history.replaceState(null, "", here);
    supabase().auth.setSession({ access_token: access, refresh_token: refresh });
  }, [here]);

  useEffect(() => {
    if (!session || !token) return;
    supabase()
      .rpc("invite_info", { p_token: token })
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message);
        setInfo(data ?? null);
      });
  }, [session, token]);

  async function accept() {
    setBusy(true);
    setError("");
    const { error: failed } = await supabase().rpc("accept_invite", { p_token: token });
    setBusy(false);
    if (failed) setError(failed.message);
    else router.replace("/app");
  }

  if (!token) return <p className="error">Falta el código de la invitación en el enlace.</p>;
  if (loading) return <p className="text-muted">Cargando…</p>;
  if (!session) {
    return (
      <div className="card flex max-w-md flex-col gap-3">
        <h1 className="text-xl">Te invitaron a una tienda en Kubbo3D</h1>
        <p className="text-sm text-muted">Entra o crea tu cuenta con el correo al que llegó la invitación para aceptarla.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/entrar?next=${encodeURIComponent(here)}`} className="btn btn-primary">
            Entrar
          </Link>
          <Link href={`/entrar?modo=registro&next=${encodeURIComponent(here)}`} className="btn">
            Crear mi cuenta
          </Link>
        </div>
      </div>
    );
  }
  if (info === undefined) return <p className="text-muted">Buscando tu invitación…</p>;
  if (!info) return <p className="error">{error || "Esta invitación ya no existe: pide que te inviten otra vez."}</p>;

  return (
    <div className="card flex max-w-md flex-col gap-3">
      <h1 className="text-xl">Únete a {info.shop}</h1>
      <p className="text-sm text-muted">
        Te invitaron como <strong className="text-white">{ROLE_NAMES[info.role]}</strong> con el correo {info.email}. Trabajarás en su tienda con tu
        cuenta; tu propia tienda sigue ahí y cambias entre las dos con el selector del menú.
      </p>
      {session.user.email?.toLowerCase() !== info.email.toLowerCase() && (
        <p className="text-sm text-warn">Entraste como {session.user.email}: sal y entra con {info.email} para aceptarla.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {info.accepted ? (
        <Link href="/app" className="btn btn-primary self-start">
          Ya la aceptaste: ir a la tienda
        </Link>
      ) : (
        <button className="btn btn-primary self-start" disabled={busy} onClick={accept}>
          {busy ? "Aceptando…" : "Aceptar invitación"}
        </button>
      )}
    </div>
  );
}

export default function InvitationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {/* useSearchParams needs a Suspense boundary to prerender the rest of the page. */}
      <Suspense>
        <Invitation />
      </Suspense>
    </main>
  );
}
