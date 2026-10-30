"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authErrorMessage, supabase } from "@/lib/supabase";

/** Seconds between checks: Supabase limits sign-ins per IP, so not much more often than this. */
const CHECK_EVERY = 12;
/** After this long it stops checking by itself (the button still works). */
const GIVE_UP_AFTER = 30 * 60;
const RESEND_WAIT = 60;

/**
 * After signing up (or trying to enter before confirming): waits for the email to be confirmed, from this
 * browser or another phone, and then signs in with the password typed a moment ago, kept only in memory,
 * so the user never types it again. It checks by itself every few seconds, when the tab comes back to the
 * front, and with "Ya lo confirmé".
 */
export function VerifyEmail({ email, password, onBack }: { email: string; password: string; onBack: () => void }) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_WAIT);
  const started = useRef(0);
  const done = useRef(false);

  /** Tries to sign in: it only works once the email is confirmed. The session then takes the user in. */
  const check = useCallback(
    async (byHand: boolean) => {
      if (done.current) return;
      if (byHand) setChecking(true);
      const { error: failed } = await supabase().auth.signInWithPassword({ email, password });
      if (byHand) setChecking(false);
      if (!failed) {
        done.current = true;
        setStatus("¡Correo confirmado! Entrando…");
        return;
      }
      if (failed.code === "email_not_confirmed") {
        if (byHand) setStatus("Todavía no vemos la confirmación. Abre el enlace del correo y vuelve a intentar.");
        return;
      }
      // A wrong password or too many attempts: checking again would not help.
      if (failed.code === "invalid_credentials") done.current = true;
      setError(authErrorMessage(failed));
    },
    [email, password],
  );

  useEffect(() => {
    if (!started.current) started.current = Date.now();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - started.current < GIVE_UP_AFTER * 1000) check(false);
    }, CHECK_EVERY * 1000);
    // Back from the email app or another tab: check right away.
    const onVisible = () => document.visibilityState === "visible" && check(false);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function resend() {
    setError("");
    setStatus("");
    const { error: failed } = await supabase().auth.resend({ type: "signup", email });
    if (failed) return setError(authErrorMessage(failed));
    setResendIn(RESEND_WAIT);
    setStatus("Te enviamos el correo otra vez.");
  }

  return (
    <div className="flex flex-col gap-4 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand/15 text-3xl" aria-hidden>
        ✉️
      </div>
      <h1 className="text-xl">Confirma tu correo</h1>
      <p className="text-sm text-muted">
        Te enviamos un enlace a <strong className="break-all text-white">{email}</strong>. Ábrelo desde este dispositivo o desde tu celular: en cuanto lo
        confirmes, entras aquí solo, sin volver a escribir tu contraseña.
      </p>
      <p className="flex items-center justify-center gap-2 text-sm text-muted" role="status">
        <span className="inline-block size-2 animate-pulse rounded-full bg-brand" aria-hidden />
        {status || "Esperando tu confirmación…"}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={() => check(true)} disabled={checking}>
        {checking ? "Revisando…" : "Ya lo confirmé"}
      </button>
      <button type="button" className="btn" onClick={resend} disabled={resendIn > 0}>
        {resendIn > 0 ? `Reenviar correo (${resendIn} s)` : "Reenviar correo"}
      </button>
      <p className="text-xs text-muted">¿No te llega? Revisa spam o promociones. Si escribiste mal tu correo, regístrate otra vez.</p>
      <button type="button" className="text-sm text-muted underline" onClick={onBack}>
        Usar otro correo
      </button>
    </div>
  );
}
