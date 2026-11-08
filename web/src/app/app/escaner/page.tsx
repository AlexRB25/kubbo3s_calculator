"use client";

import { useCallback, useEffect, useState } from "react";
import { ScanCamera } from "@/components/app/ScanCamera";
import { Empty, PageHeader } from "@/components/app/ui";
import { getWorkshopCurrency } from "@/lib/format";
import { SCAN_FORMATS as FORMATS, SCAN_MAX_BYTES, SCAN_STATUS, type ScanBalance as Balance, type ScanItem as Scan } from "@/lib/scan";
import { supabase } from "@/lib/supabase";

type Pack = { id: string; scans: number };
const TONE = { warn: "text-warn", good: "text-money", bad: "text-bad", muted: "text-muted" } as const;
const STATUS = Object.fromEntries(Object.entries(SCAN_STATUS).map(([key, value]) => [key, { label: value.label, tone: TONE[value.tone] }]));

async function bearer() {
  const { data } = await supabase().auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function ScannerPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [camera, setCamera] = useState(false);
  const [format, setFormat] = useState("stl");
  const [files, setFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    const [mine, list, status] = await Promise.all([
      supabase().rpc("scan_balance"),
      supabase().from("scan_packs").select("id, scans").order("sort"),
      fetch("/api/escaner/estado", { headers: await bearer() }).then((response) => response.json()).catch(() => null),
    ]);
    if (mine.error) setError(mine.error.code === "PGRST202" ? "Falta actualizar la base de datos (supabase/schema.sql) para usar el escáner." : mine.error.message);
    else setBalance(mine.data as Balance);
    setPacks((list.data ?? []) as Pack[]);
    if (status?.scans) setScans(status.scans);
  }, []);

  useEffect(() => {
    // Back from Stripe: confirm the pack at once, then read everything.
    const session = new URLSearchParams(window.location.search).get("session_id");
    const first = session
      ? fetch("/api/escaner/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: session }) }).then(() =>
          window.history.replaceState(null, "", "/app/escaner"),
        )
      : Promise.resolve();
    first.then(load);
  }, [load]);

  // While a scan is being processed, ask again every 20 seconds.
  const working = scans.some((scan) => ["uploading", "queued", "processing"].includes(scan.status));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [working, load]);

  async function buy(pack: Pack) {
    setError("");
    setBusy(`Abriendo el pago de ${pack.scans} escaneos…`);
    const response = await fetch("/api/escaner/comprar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await bearer()) },
      body: JSON.stringify({ pack_id: pack.id, currency: getWorkshopCurrency() }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !body?.url) {
      setBusy("");
      return setError(body?.error ?? "No se pudo iniciar el pago.");
    }
    window.location.assign(body.url);
  }

  async function scan() {
    setError("");
    if (files.length < 20 || files.length > 300) return setError(`Se necesitan de 20 a 300 fotos (llevas ${files.length}).`);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > SCAN_MAX_BYTES) return setError("Las fotos pesan más de 250 MB: escanea de nuevo con menos fotos.");
    setBusy("Apartando tu escaneo…");
    const claimed = await supabase().rpc("claim_scan", { p_name: name.trim() || "Escaneo", p_kind: "photos", p_format: format });
    if (claimed.error) {
      setBusy("");
      return setError(claimed.error.message);
    }
    const id = claimed.data as string;
    const { data: session } = await supabase().auth.getSession();
    const user = session.session?.user.id;
    try {
      for (let index = 0; index < files.length; index++) {
        setBusy(`Subiendo ${index + 1} de ${files.length}…`);
        const file = files[index];
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const uploaded = await supabase()
          .storage.from("scans")
          .upload(`${user}/${id}/in/${String(index + 1).padStart(4, "0")}.${extension}`, file, { contentType: file.type || undefined });
        if (uploaded.error) throw new Error(uploaded.error.message);
      }
      setBusy("Enviando a procesar…");
      const response = await fetch("/api/escaner/iniciar", { method: "POST", headers: { "Content-Type": "application/json", ...(await bearer()) }, body: JSON.stringify({ scan_id: id }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.scan?.error ?? body?.error ?? "No se pudo enviar el escaneo.");
      setFiles([]);
      setName("");
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : "No se pudo subir."} El escaneo no se te cobra.`);
    } finally {
      setBusy("");
      load();
    }
  }

  const left = balance ? balance.plan_left + balance.pack_left : 0;
  const price = balance?.price_usd ?? 0;

  return (
    <>
      <PageHeader title="Escáner 3D" />
      <p className="text-sm text-muted">Rodea un objeto con tu cámara y conviértelo en un modelo 3D para imprimir, copiar o modificar.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {balance && (
        <section className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <div className="card flex flex-col gap-2">
            <h2>Tus escaneos</h2>
            <p className="text-4xl font-black text-brand tabular-nums">{left}</p>
            <p className="text-sm text-muted">
              {balance.plan_scans > 0 ? `${balance.plan_left} de ${balance.plan_scans} de tu plan este mes` : "Tu plan no incluye escaneos al mes"}
              {balance.pack_left > 0 && ` · ${balance.pack_left} comprados (no vencen)`}
            </p>
            {!balance.active && <p className="text-sm text-warn">Para escanear necesitas una suscripción activa (Maker, Taller o Fábrica).</p>}
          </div>
          <div className="card flex flex-col gap-3">
            <h2>Paquetes de escaneos</h2>
            <p className="text-sm text-muted">Se suman a los de tu plan y no vencen. Cada escaneo: USD {price.toFixed(2)}.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {packs.map((pack) => (
                <button key={pack.id} className="btn flex flex-col py-3" disabled={!balance.active || !!busy} onClick={() => buy(pack)}>
                  <span className="text-lg font-black">{pack.scans}</span>
                  <span className="text-xs text-muted">USD {(pack.scans * price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {balance?.active && (
        <section className="card flex flex-col gap-4">
          <h2>Nuevo escaneo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">
              Nombre
              <input className="input" value={name} placeholder="Figura de mi abuela" onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="label">
              Formato del modelo
              <select className="input" value={format} onChange={(event) => setFormat(event.target.value)}>
                {FORMATS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className={`btn ${files.length ? "" : "btn-primary"} self-start`} disabled={!!busy} onClick={() => setCamera(true)}>
            {files.length ? `${files.length} fotos tomadas · volver a escanear` : "Abrir la cámara y escanear"}
          </button>
          <p className="text-sm text-muted">
            Funciona desde el navegador de tu celular o con una webcam en la computadora. La cámara te va guiando (hacia dónde girar, si vas muy rápido o si falta luz) y toma las fotos sola.
          </p>
          <button className="btn btn-primary self-start" disabled={!!busy || !files.length || left <= 0} onClick={scan}>
            {busy || (left <= 0 ? "Sin escaneos disponibles" : files.length ? "Enviar a procesar (usa 1 escaneo)" : "Primero toma las fotos")}
          </button>
        </section>
      )}

      {camera && (
        <ScanCamera
          onCancel={() => setCamera(false)}
          onDone={(taken) => {
            setCamera(false);
            setError("");
            setFiles(taken);
          }}
        />
      )}

      <section className="flex flex-col gap-2">
        <h2>Mis escaneos</h2>
        {scans.length === 0 ? (
          <Empty>Aquí aparecen tus escaneos. Procesar uno tarda de 10 a 60 minutos; puedes cerrar la página y volver.</Empty>
        ) : (
          scans.map((item) => (
            <div key={item.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{item.name || "Escaneo"}</p>
                <p className="text-xs text-muted">
                  {new Date(item.created_at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} · {item.kind === "video" ? "video" : "fotos"} ·{" "}
                  {item.file_format.toUpperCase()} · {item.source === "plan" ? "del plan" : "de paquete"}
                </p>
                {item.error && <p className="text-xs text-bad">{item.error}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${STATUS[item.status]?.tone ?? ""}`}>{STATUS[item.status]?.label ?? item.status}</span>
                {item.url && (
                  <a className="btn btn-primary" href={item.url}>
                    Descargar
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}
