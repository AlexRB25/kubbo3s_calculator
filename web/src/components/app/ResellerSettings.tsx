"use client";

import { useState } from "react";
import { useData, useSave } from "@/lib/data";
import { field, money, num } from "@/lib/format";
import { supabase } from "@/lib/supabase";

/** What a $100 price becomes with the resellers' % on top, so the workshop keeps the same. */
const example = (pct: number) => (pct > 0 && pct < 90 ? 100 / (1 - pct / 100) : 100);

/**
 * Resellers: a % added to the final price of every product, the same in every store or one per store
 * (TikTok, Mercado Libre…). Prices count it like one more commission, so the profit stays the same.
 */
export function ResellerSettings() {
  const { profile, channels } = useData();
  const { busy, error, setError, save } = useSave();
  const [general, setGeneral] = useState(field(profile?.reseller_pct));
  const [byChannel, setByChannel] = useState(Boolean(profile?.reseller_by_channel));
  const [perChannel, setPerChannel] = useState<Record<string, string>>(() => Object.fromEntries(channels.map((channel) => [channel.id, field(channel.reseller_pct)])));
  const [done, setDone] = useState(false);
  if (!profile) return null;
  if (profile.reseller_pct === undefined)
    return (
      <div className="card max-w-2xl">
        <h2>Revendedores</h2>
        <p className="text-sm text-muted">Falta correr la parte «Revendedores» de supabase/schema.sql para usar esta sección.</p>
      </div>
    );

  function submit() {
    setDone(false);
    const values = byChannel ? channels.map((channel) => num(perChannel[channel.id] ?? "")) : [num(general)];
    if (values.some((pct) => !(pct >= 0 && pct < 90))) return setError("El % de revendedor va de 0 a 89.");
    save(async () => {
      const first = await supabase()
        .from("profiles")
        .update({ reseller_pct: byChannel ? profile!.reseller_pct : num(general), reseller_by_channel: byChannel })
        .eq("id", profile!.id);
      if (first.error || !byChannel) return first;
      for (const channel of channels) {
        const result = await supabase().from("channels").update({ reseller_pct: num(perChannel[channel.id] ?? "") }).eq("id", channel.id);
        if (result.error) return result;
      }
      return first;
    }, () => setDone(true));
  }

  return (
    <div className="card flex max-w-2xl flex-col gap-3">
      <div>
        <h2>Revendedores</h2>
        <p className="text-sm text-muted">
          El % que le das a tus revendedores o afiliados. Se suma al precio final de tus productos como una comisión más, así cuando ellos venden y se llevan su
          parte, tú ganas lo mismo.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`btn ${!byChannel ? "btn-on" : ""}`} onClick={() => setByChannel(false)}>
          Igual en todas las tiendas
        </button>
        <button type="button" className={`btn ${byChannel ? "btn-on" : ""}`} onClick={() => setByChannel(true)}>
          Distinto por tienda
        </button>
      </div>
      {!byChannel ? (
        <label className="label">
          % para revendedores
          <span className="flex items-center gap-2 font-normal">
            <input className="input" style={{ width: "6rem" }} type="number" min={0} max={89} step="any" value={general} onChange={(event) => setGeneral(event.target.value)} placeholder="0" />%
          </span>
          <span className="font-normal">
            {num(general) > 0 ? `Ejemplo: un precio de ${money(100)} sube a ${money(example(num(general)))}.` : "0 = sin revendedores: los precios no cambian."}
          </span>
        </label>
      ) : channels.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {channels.map((channel) => (
            <label key={channel.id} className="label">
              {channel.name}
              <span className="flex items-center gap-2 font-normal">
                <input
                  className="input"
                  style={{ width: "6rem" }}
                  type="number"
                  min={0}
                  max={89}
                  step="any"
                  value={perChannel[channel.id] ?? ""}
                  onChange={(event) => setPerChannel({ ...perChannel, [channel.id]: event.target.value })}
                  placeholder="0"
                />
                %
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Primero agrega tus tiendas en Canales de venta.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        {done && <span className="text-sm text-money">Guardado: los precios sugeridos ya lo incluyen.</span>}
      </div>
    </div>
  );
}
