"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MarketPanel } from "@/components/market/Panel";
import { day, money } from "@/lib/format";
import { PAYOUT_METHODS, type Balance, type PayoutMethod } from "@/lib/market";
import { supabase } from "@/lib/supabase";

type Sale = { id: string; model_id: string; title: string; price: number; fee: number; seller_amount: number; status: string; paid_at: string };
type Payout = { id: string; amount: number; method: PayoutMethod; account: string; status: "requested" | "paid" | "rejected"; reference: string; created_at: string };
type PayoutInfo = { method: PayoutMethod; account: string; holder: string };

const PAYOUT_STATUS = { requested: "En proceso", paid: "Pagado", rejected: "Rechazado" };

export default function SalesPage() {
  return <MarketPanel title="Ventas y retiros">{(session) => <Sales userId={session.user.id} />}</MarketPanel>;
}

function Sales({ userId }: { userId: string }) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [info, setInfo] = useState<PayoutInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const db = supabase();
    const [owed, sold, paid, details] = await Promise.all([
      db.rpc("my_balance"),
      db.from("model_purchases").select("id, model_id, title, price, fee, seller_amount, status, paid_at").eq("seller_id", userId).neq("status", "pending").order("paid_at", { ascending: false }).limit(200),
      db.from("maker_payouts").select("id, amount, method, account, status, reference, created_at").order("created_at", { ascending: false }),
      db.from("maker_payout_info").select("method, account, holder").maybeSingle(),
    ]);
    const failed = owed.error ?? sold.error ?? paid.error;
    if (failed) setError(failed.message);
    setBalance(owed.data);
    setSales(sold.data ?? []);
    setPayouts(paid.data ?? []);
    setInfo(details.data);
  }, [userId]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  async function withdraw() {
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error: failed } = await supabase().rpc("request_payout");
    setBusy(false);
    if (failed) return setError(failed.message);
    setNotice(`Pediste un retiro de ${money(data.amount)}. Te avisamos cuando esté pagado.`);
    await load();
  }

  if (!balance) return <p className={error ? "error" : "text-muted"}>{error || "Cargando…"}</p>;
  const canWithdraw = balance.available > 0 && balance.available >= balance.min_payout && !payouts.some((item) => item.status === "requested");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Disponible para retirar" value={money(balance.available)} strong />
        <Tile label={`Esperando ${balance.hold_days} días`} value={money(balance.held)} hint="Por reembolsos y contracargos" />
        <Tile label="En retiro" value={money(balance.requested)} />
        <Tile label="Ya retirado" value={money(balance.withdrawn)} />
      </div>
      <p className="text-sm text-muted">
        Kubbo cobra al comprador con Mercado Pago (en pesos; acepta tarjetas de casi cualquier país) y se queda el {balance.fee_pct} % de cada venta. Lo demás
        suma a tu saldo; puedes retirarlo desde {money(balance.min_payout)}.
      </p>

      <section className="card flex max-w-2xl flex-col gap-3">
        <h2>Retirar</h2>
        <PayoutForm userId={userId} info={info} onSaved={load} />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-brand">{notice}</p>}
        <button className="btn btn-primary self-start" disabled={busy || !info || !canWithdraw} onClick={withdraw}>
          {busy ? "Pidiendo…" : `Retirar ${money(balance.available)}`}
        </button>
      </section>

      {payouts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2>Retiros</h2>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>A</th>
                  <th>Estado</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td>{day(payout.created_at)}</td>
                    <td className="text-sm">
                      {PAYOUT_METHODS.find((item) => item.value === payout.method)?.label} · {payout.account}
                    </td>
                    <td className={payout.status === "paid" ? "text-money" : payout.status === "rejected" ? "text-bad" : "text-warn"}>
                      {PAYOUT_STATUS[payout.status]}
                      {payout.reference && <div className="text-xs text-muted">{payout.reference}</div>}
                    </td>
                    <td className="num">{money(payout.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2>Ventas</h2>
        {sales.length === 0 ? (
          <p className="card text-center text-muted">Todavía no vendes modelos.</p>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Modelo</th>
                  <th className="num">Precio</th>
                  <th className="num">Comisión</th>
                  <th className="num">Para ti</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className={sale.status === "refunded" ? "text-muted line-through" : ""}>
                    <td>{sale.paid_at ? day(sale.paid_at) : "—"}</td>
                    <td>
                      <Link href={`/modelos/${sale.model_id}`} className="hover:text-brand">
                        {sale.title}
                      </Link>
                      {sale.status === "refunded" && <span className="ml-2 text-xs no-underline">(reembolsada)</span>}
                    </td>
                    <td className="num">{money(sale.price)}</td>
                    <td className="num">{money(sale.fee)}</td>
                    <td className="num text-money">{money(sale.seller_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <strong className={`text-xl tabular-nums ${strong ? "text-money" : ""}`}>{value}</strong>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function PayoutForm({ userId, info, onSaved }: { userId: string; info: PayoutInfo | null; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(!info);
  const [method, setMethod] = useState<PayoutMethod>(info?.method ?? "clabe");
  const [account, setAccount] = useState(info?.account ?? "");
  const [holder, setHolder] = useState(info?.holder ?? "");
  const [error, setError] = useState("");
  const chosen = PAYOUT_METHODS.find((item) => item.value === method)!;

  async function save(event: FormEvent) {
    event.preventDefault();
    const clean = method === "clabe" ? account.replace(/\s+/g, "") : account.trim();
    if (method === "clabe" && !/^\d{18}$/.test(clean)) return setError("La CLABE tiene 18 dígitos.");
    if (method !== "clabe" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return setError("Escribe el correo de tu cuenta.");
    const { error: failed } = await supabase()
      .from("maker_payout_info")
      .upsert({ user_id: userId, method, account: clean, holder: holder.trim(), updated_at: new Date().toISOString() });
    if (failed) return setError(failed.message);
    setError("");
    setEditing(false);
    await onSaved();
  }

  if (!editing && info) {
    return (
      <p className="text-sm">
        Te pagamos por <strong>{PAYOUT_METHODS.find((item) => item.value === info.method)?.label}</strong> a {info.account}
        {info.holder && ` (${info.holder})`}.{" "}
        <button className="text-brand hover:underline" onClick={() => setEditing(true)}>
          Cambiar
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PAYOUT_METHODS.map((item) => (
          <label key={item.value} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-brand">
            <input type="radio" name="method" checked={method === item.value} onChange={() => setMethod(item.value)} />
            {item.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">{chosen.hint}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          {method === "clabe" ? "CLABE" : "Correo de la cuenta"}
          <input className="input" required value={account} onChange={(event) => setAccount(event.target.value)} placeholder={chosen.placeholder} />
        </label>
        <label className="label">
          Titular
          <input className="input" value={holder} onChange={(event) => setHolder(event.target.value)} placeholder="Nombre como aparece en la cuenta" />
        </label>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn self-start">Guardar datos de pago</button>
    </form>
  );
}
