"use client";

import { useState } from "react";
import { FieldsForm, Modal, PageHeader, TableCard, type FieldDef } from "@/components/app/ui";
import { useData } from "@/lib/data";
import { money } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/types";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Nombre", required: true, wide: true, placeholder: "Mercado Libre" },
  { name: "commission_pct", label: "Comisión (%)", type: "number", hint: "Porcentaje del precio que se queda la plataforma." },
  {
    name: "tax_pct",
    label: "Impuestos (%)",
    type: "number",
    hint: "Lo que se va en impuestos de cada venta: retenciones de IVA e ISR de la plataforma o los que pagas tú. Se descuenta como la comisión.",
  },
  { name: "fixed_fee", label: "Cargo fijo por pieza ($)", type: "number", hint: "Por ejemplo, el costo fijo en publicaciones de precio bajo." },
  { name: "shipping_cost", label: "Envío que pagas por venta ($)", type: "number", hint: "0 si lo paga el comprador." },
];

export default function ChannelsPage() {
  const { channels } = useData();
  const [editing, setEditing] = useState<Channel | "new" | null>(null);
  const current = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <>
      <PageHeader title="Canales de venta">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo canal
        </button>
      </PageHeader>
      <p className="text-sm text-muted">
        Las comisiones de arranque son aproximadas: cámbialas por las que tu cuenta paga de verdad en cada plataforma, y agrega
        los impuestos que se van de cada venta, porque de ellos sale el precio sugerido y la ganancia de cada venta.
      </p>

      <TableCard>
        <table className="table">
          <thead>
            <tr>
              <th>Canal</th>
              <th className="num">Comisión</th>
              <th className="num">Impuestos</th>
              <th className="num">Cargo fijo</th>
              <th className="num">Envío</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => (
              <tr key={channel.id}>
                <td>{channel.name}</td>
                <td className="num">{channel.commission_pct}%</td>
                <td className="num">{channel.tax_pct ?? 0}%</td>
                <td className="num">{money(channel.fixed_fee)}</td>
                <td className="num">{money(channel.shipping_cost)}</td>
                <td className="num">
                  <button className="btn" onClick={() => setEditing(channel)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {editing && (
        <Modal title={current?.name ?? "Nuevo canal"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={FIELDS}
            initial={current}
            onDone={() => setEditing(null)}
            onSubmit={(values) => {
              if (Number(values.commission_pct) + Number(values.tax_pct ?? 0) >= 100)
                return Promise.resolve({ error: { message: "Comisión más impuestos deben sumar menos de 100%." } });
              return current
                ? supabase().from("channels").update(values).eq("id", current.id)
                : supabase().from("channels").insert({ ...values, sort: channels.length + 1 });
            }}
            onDelete={current ? () => supabase().from("channels").delete().eq("id", current.id) : undefined}
            deleteConfirm="Las ventas ya registradas conservan el nombre del canal. ¿Eliminar?"
          />
        </Modal>
      )}
    </>
  );
}
