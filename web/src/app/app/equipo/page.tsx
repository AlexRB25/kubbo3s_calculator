"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Empty, PageHeader } from "@/components/app/ui";
import { useData } from "@/lib/data";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { ShopRole } from "@/lib/types";

type Member = { user_id: string; role: "admin" | "staff"; created_at: string; name: string; email: string };
type Invite = { id: string; email: string; role: "admin" | "staff"; token: string; created_at: string };

const ROLES: { value: "admin" | "staff"; label: string; hint: string }[] = [
  { value: "staff", label: "Colaborador", hint: "Productos, filamento, impresiones, ventas, inventario y compras. No borra ni toca canales, paqueterías, impresoras, proveedores ni ajustes." },
  { value: "admin", label: "Administrador", hint: "Todo menos Ajustes, Equipo y tu suscripción." },
];
const ROLE_NAMES: Record<ShopRole, string> = { owner: "Dueño", admin: "Administrador", staff: "Colaborador" };

const inviteLink = (token: string) => `${window.location.origin}/invitacion?token=${token}`;

/** The shop's team: the owner invites people by email and gives each a role; a collaborator can leave. */
export default function TeamPage() {
  const { shop } = useData();
  return shop && shop.role !== "owner" ? <Collaborator /> : <OwnerTeam />;
}

function Collaborator() {
  const { shop, reload } = useData();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = shop?.shops.find((item) => item.owner_id === shop.shop_id)?.name ?? "esta tienda";

  async function leave() {
    if (!window.confirm(`¿Salir de ${name}? Ya no podrás ver ni registrar nada en ella hasta que te inviten otra vez.`)) return;
    setBusy(true);
    const { error: failed } = await supabase().from("shop_members").delete().eq("owner_id", shop!.shop_id).eq("user_id", session!.user.id);
    if (!failed) await supabase().from("profiles").update({ active_shop: null }).eq("id", session!.user.id);
    setBusy(false);
    if (failed) setError(failed.message);
    else await reload();
  }

  return (
    <>
      <PageHeader title="Equipo" />
      <div className="card flex max-w-2xl flex-col gap-3">
        <p>
          Trabajas en <strong>{name}</strong> como <strong>{ROLE_NAMES[shop!.role]}</strong>.
        </p>
        <p className="text-sm text-muted">
          Para invitar a tu propio equipo, cambia a tu tienda con el selector «Tienda» del menú.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="btn btn-danger self-start" disabled={busy} onClick={leave}>
          Salir de esta tienda
        </button>
      </div>
    </>
  );
}

function OwnerTeam() {
  const { shop, reload } = useData();
  const { session } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const userId = session!.user.id;

  const load = useCallback(async () => {
    const db = supabase();
    const [team, pending] = await Promise.all([
      db.from("shop_members").select("user_id, role, created_at").eq("owner_id", userId).order("created_at"),
      db.from("shop_invites").select("id, email, role, token, created_at").is("accepted_at", null).order("created_at", { ascending: false }),
    ]);
    if (team.error || pending.error) return setError((team.error ?? pending.error)!.message);
    const ids = (team.data ?? []).map((row) => row.user_id);
    const people = ids.length ? await db.from("profiles").select("id, name, email").in("id", ids) : { data: [] as { id: string; name: string; email: string }[] };
    setMembers(
      (team.data ?? []).map((row) => {
        const person = people.data?.find((item) => item.id === row.user_id);
        return { ...row, name: person?.name ?? "", email: person?.email ?? "" } as Member;
      }),
    );
    setInvites((pending.data ?? []) as Invite[]);
  }, [userId]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const seats = shop?.seats;
  const used = members.length + invites.length;
  const full = seats?.max != null && used >= seats.max;

  async function invite(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { data } = await supabase().auth.getSession();
      const response = await fetch("/api/equipo/invitar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ email, role }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "No se pudo invitar.");
      setNotice(body.emailed ? `Le mandamos un correo a ${email} con la invitación.` : body.note);
      setEmail("");
      await Promise.all([load(), reload()]);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setError("");
    const { error: failed } = await action();
    if (failed) setError(failed.message);
    await Promise.all([load(), reload()]);
  }

  async function copy(token: string) {
    await navigator.clipboard.writeText(inviteLink(token));
    setNotice("Enlace copiado: mándalo por WhatsApp o mensaje. Solo sirve con el correo invitado.");
  }

  return (
    <>
      <PageHeader title="Equipo" />
      <p className="max-w-3xl text-sm text-muted">
        Invita a quien te ayuda en el taller: cada quien entra con su propia cuenta y trabaja en tu tienda. Tú decides su rol; los ajustes, el equipo y tu
        suscripción solo los cambias tú.
      </p>

      <form onSubmit={invite} className="card flex max-w-3xl flex-col gap-3">
        <h2>Invitar por correo</h2>
        <p className="text-sm text-muted">
          {seats?.max == null
            ? "Tu plan no tiene límite de colaboradores."
            : seats.max === 0
              ? "Tu plan no incluye colaboradores: mejóralo en la página de precios para invitar."
              : `Tu plan incluye ${seats.max} colaborador${seats.max === 1 ? "" : "es"}: llevas ${used} (contando invitaciones pendientes).`}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="label min-w-56 flex-1">
            Correo
            <input className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ayudante@correo.com" />
          </label>
          <label className="label">
            Rol
            <select className="input" value={role} onChange={(event) => setRole(event.target.value as "admin" | "staff")}>
              {ROLES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy || full}>
            {busy ? "Invitando…" : "Invitar"}
          </button>
        </div>
        <p className="text-xs text-muted">{ROLES.find((item) => item.value === role)!.hint}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p className="text-sm text-brand">{notice}</p>}
      </form>

      <section className="card flex max-w-3xl flex-col gap-3">
        <h2>Tu equipo</h2>
        {members.length === 0 ? (
          <Empty>Todavía no hay nadie. Cuando acepten tu invitación aparecerán aquí.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {members.map((member) => (
              <li key={member.user_id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{member.name || member.email}</p>
                  {member.name && <p className="text-xs text-muted">{member.email}</p>}
                </div>
                <select
                  className="input w-auto"
                  value={member.role}
                  aria-label={`Rol de ${member.email}`}
                  onChange={(event) =>
                    act(() => supabase().from("shop_members").update({ role: event.target.value }).eq("owner_id", userId).eq("user_id", member.user_id))
                  }
                >
                  {ROLES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button
                  className="btn text-bad"
                  onClick={() => {
                    if (window.confirm(`¿Quitar a ${member.email} de tu tienda? Lo que registró se queda.`))
                      act(() => supabase().from("shop_members").delete().eq("owner_id", userId).eq("user_id", member.user_id));
                  }}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invites.length > 0 && (
        <section className="card flex max-w-3xl flex-col gap-3">
          <h2>Invitaciones pendientes</h2>
          <ul className="flex flex-col divide-y divide-line">
            {invites.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{item.email}</p>
                  <p className="text-xs text-muted">{ROLE_NAMES[item.role]}</p>
                </div>
                <button className="btn" onClick={() => copy(item.token)}>
                  Copiar enlace
                </button>
                <button className="btn text-bad" onClick={() => act(() => supabase().from("shop_invites").delete().eq("id", item.id))}>
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
