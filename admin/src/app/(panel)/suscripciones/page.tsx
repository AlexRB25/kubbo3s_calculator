import { cancelSubscription, grantSubscription } from "@/app/actions";
import { dateTime, money } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Subscription = {
  id: string;
  user_id: string;
  plan_id: string;
  source: "mercadopago" | "admin";
  status: "pending" | "authorized" | "paused" | "cancelled";
  lifetime: boolean;
  amount: number;
  currency: string;
  paid_until: string | null;
  next_payment_date: string | null;
  note: string;
  created_at: string;
};

const MP_STATUS = { pending: "Pendiente de pago", authorized: "Activa", paused: "Pausada (no se pudo cobrar)", cancelled: "Cancelada" };

const DAY = 24 * 60 * 60 * 1000;

/** This page renders on every request (server only), so reading the clock here is fine. */
const currentTime = () => Date.now();

/** Where a subscription stands, and whether the panel can cancel it. */
function standing(subscription: Subscription, now: number) {
  const until = subscription.paid_until ? new Date(subscription.paid_until).getTime() : null;
  if (subscription.source === "admin") {
    if (subscription.status === "cancelled") return { label: "Cancelada", tone: "text-muted", live: false };
    if (subscription.lifetime) return { label: "Activa · de por vida", tone: "text-money", live: true };
    if (until && until > now) {
      const days = Math.ceil((until - now) / DAY);
      return { label: `Activa · vence en ${days} ${days === 1 ? "día" : "días"}`, tone: "text-money", live: true };
    }
    return { label: "Vencida", tone: "text-muted", live: false };
  }
  if (subscription.status === "cancelled" && until && until > now) return { label: "Cancelada, pagada hasta su fecha", tone: "text-warn", live: false };
  return { label: MP_STATUS[subscription.status], tone: subscription.status === "authorized" ? "text-money" : "text-muted", live: false };
}

/** Plans given by hand (tests, courtesies) next to the ones paid with Mercado Pago. */
export default async function SubscriptionsPage({ searchParams }: PageProps<"/suscripciones">) {
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const done = String(params.listo ?? "");
  const failed = String(params.error ?? "");

  const plans = must(await admin().from("plans").select("id, name, price_usd").order("sort")) as { id: string; name: string; price_usd: number }[];
  const subscriptions = must(
    await admin().from("subscriptions").select("*").neq("status", "pending").order("created_at", { ascending: false }).limit(300),
  ) as Subscription[];
  const ids = [...new Set(subscriptions.map((subscription) => subscription.user_id))];
  const emails = new Map(
    ids.length
      ? (must(await admin().from("admin_users").select("id, email").in("id", ids)) as { id: string; email: string }[]).map((user) => [user.id, user.email])
      : [],
  );
  const needle = query.toLowerCase();
  const shown = subscriptions.filter((subscription) => !needle || (emails.get(subscription.user_id) ?? "").toLowerCase().includes(needle));
  const now = currentTime();

  return (
    <>
      <header>
        <h1>Suscripciones</h1>
        <p className="text-sm text-muted">
          Asigna un plan a una cuenta sin cobrarle (pruebas, cortesías). Manda la suscripción vigente más reciente; al vencer o cancelarla, la cuenta vuelve a su
          plan pagado o a Gratis.
        </p>
      </header>

      {done && <p className="card border-brand text-brand">{done}</p>}
      {failed && <p className="card text-bad">{failed}</p>}

      <form action={grantSubscription} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <h2 className="sm:col-span-2">Asignar plan</h2>
        <label className="label sm:col-span-2">
          Correo de la cuenta
          <input name="email" type="email" className="input" required placeholder="cliente@correo.com" />
        </label>
        <label className="label">
          Plan
          <select name="plan" className="input" required defaultValue={plans.find((plan) => plan.price_usd > 0)?.id}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
                {plan.price_usd > 0 ? ` · USD ${plan.price_usd}/mes` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Duración
          <select name="duration" className="input" defaultValue="1m">
            <option value="7d">7 días</option>
            <option value="1m">1 mes</option>
            <option value="3m">3 meses</option>
            <option value="12m">1 año</option>
            <option value="life">De por vida</option>
            <option value="date">Hasta una fecha…</option>
          </select>
        </label>
        <label className="label">
          Fecha de vencimiento
          <input name="until" type="date" className="input" />
          <span className="font-normal">Solo si elegiste «Hasta una fecha». Vence al terminar ese día.</span>
        </label>
        <label className="label">
          Nota
          <input name="note" className="input" maxLength={200} placeholder="Prueba interna, cortesía a…" />
        </label>
        <div className="sm:col-span-2">
          <button className="btn btn-primary">Asignar plan</button>
          <p className="mt-1 text-xs text-muted">Si la cuenta ya tenía un plan asignado aquí y vigente, ese se cancela y queda el nuevo.</p>
        </div>
      </form>

      <form className="flex flex-wrap items-end gap-3">
        <label className="label min-w-48 flex-1">
          Buscar por correo
          <input name="q" defaultValue={query} className="input" />
        </label>
        <button className="btn">Buscar</button>
      </form>

      {shown.length === 0 ? (
        <p className="card text-muted">No hay suscripciones{query ? " con ese correo" : ""}.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Plan</th>
                <th>Origen</th>
                <th>Estado</th>
                <th>Vence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((subscription) => {
                const state = standing(subscription, now);
                const plan = plans.find((item) => item.id === subscription.plan_id);
                return (
                  <tr key={subscription.id}>
                    <td>
                      {emails.get(subscription.user_id) ?? "—"}
                      {subscription.note && <div className="text-xs text-muted">{subscription.note}</div>}
                    </td>
                    <td>{plan?.name ?? subscription.plan_id}</td>
                    <td className="text-muted">
                      {subscription.source === "admin" ? "Asignada" : `Mercado Pago · ${money(subscription.amount)} ${subscription.currency}`}
                    </td>
                    <td className={state.tone}>{state.label}</td>
                    <td className="whitespace-nowrap text-muted">
                      {subscription.lifetime
                        ? "Nunca"
                        : subscription.source === "mercadopago" && subscription.status === "authorized" && subscription.next_payment_date
                          ? `Próximo cobro ${dateTime(subscription.next_payment_date)}`
                          : subscription.paid_until
                            ? dateTime(subscription.paid_until)
                            : "—"}
                    </td>
                    <td className="num">
                      {state.live && (
                        <form action={cancelSubscription}>
                          <input type="hidden" name="id" value={subscription.id} />
                          <button className="btn text-bad">Cancelar</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
