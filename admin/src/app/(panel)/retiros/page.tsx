import { processPayout } from "@/app/actions";
import { money } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Payout = {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  account: string;
  holder: string;
  status: "requested" | "paid" | "rejected";
  reference: string;
  created_at: string;
  processed_at: string | null;
};

const METHODS: Record<string, string> = { clabe: "CLABE", mercadopago: "Mercado Pago", paypal: "PayPal" };
const STATUS = { requested: "Por pagar", paid: "Pagado", rejected: "Rechazado" };
const date = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

/**
 * Sellers' withdrawal requests. Send the money (bank transfer, Mercado Pago or PayPal) and then mark it paid with
 * the transfer's reference; rejecting returns the amount to the seller's balance.
 */
export default async function PayoutsPage({ searchParams }: PageProps<"/retiros">) {
  const params = await searchParams;
  const payouts = must(await admin().from("maker_payouts").select("*").order("created_at", { ascending: false }).limit(300)) as Payout[];
  const makers = must(await admin().from("makers").select("user_id, handle, name")) as { user_id: string; handle: string; name: string }[];
  const who = new Map(makers.map((maker) => [maker.user_id, maker]));
  const open = payouts.filter((payout) => payout.status === "requested");

  return (
    <>
      <header>
        <h1>Retiros de vendedores</h1>
        <p className="text-sm text-muted">
          {open.length} por pagar ({money(open.reduce((total, payout) => total + Number(payout.amount), 0))}). Envía el dinero y márcalo pagado con el folio; si
          lo rechazas, el monto vuelve al saldo del vendedor.
        </p>
      </header>
      {typeof params.error === "string" && (
        <p role="alert" className="error">
          {params.error}
        </p>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Vendedor</th>
              <th>Pagar a</th>
              <th className="num">Monto</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((payout) => {
              const maker = who.get(payout.user_id);
              return (
                <tr key={payout.id}>
                  <td>{date(payout.created_at)}</td>
                  <td className="text-sm">
                    {maker?.name || "—"}
                    <div className="text-xs text-muted">@{maker?.handle}</div>
                  </td>
                  <td className="text-sm">
                    {METHODS[payout.method] ?? payout.method}: <span className="select-all font-mono">{payout.account}</span>
                    {payout.holder && <div className="text-xs text-muted">{payout.holder}</div>}
                  </td>
                  <td className="num">{money(payout.amount)}</td>
                  <td>
                    {payout.status === "requested" ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={processPayout} className="flex gap-2">
                          <input type="hidden" name="id" value={payout.id} />
                          <input type="hidden" name="status" value="paid" />
                          <input name="reference" placeholder="Folio del pago" className="input w-36" />
                          <button className="btn btn-primary">Pagado</button>
                        </form>
                        <form action={processPayout} className="flex gap-2">
                          <input type="hidden" name="id" value={payout.id} />
                          <input type="hidden" name="status" value="rejected" />
                          <input name="reference" placeholder="Motivo" className="input w-32" />
                          <button className="btn text-bad">Rechazar</button>
                        </form>
                      </div>
                    ) : (
                      <span className={payout.status === "paid" ? "text-money" : "text-bad"}>
                        {STATUS[payout.status]}
                        {payout.reference && <span className="block text-xs text-muted">{payout.reference}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {payouts.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted">
                  Nadie ha pedido retiros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
