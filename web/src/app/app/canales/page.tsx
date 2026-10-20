"use client";

import { useState } from "react";
import { ChannelForm } from "@/components/app/ChannelForm";
import { Modal, PageHeader, TableCard } from "@/components/app/ui";
import { useData } from "@/lib/data";
import { money } from "@/lib/format";
import type { Channel } from "@/lib/types";

export default function ChannelsPage() {
  const { channels, carriers } = useData();
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
                <td className="num">
                  {Number(channel.tax_pct ?? 0).toFixed(2)}%
                  {channel.taxes?.length > 0 && <span className="block text-xs text-muted">{channel.taxes.map((tax) => `${tax.name} ${tax.pct}%`).join(" + ")}</span>}
                </td>
                <td className="num">{money(channel.fixed_fee)}</td>
                <td className="num">
                  {channel.carrier_ids?.length
                    ? carriers
                        .filter((carrier) => channel.carrier_ids.includes(carrier.id))
                        .map((carrier) => carrier.name)
                        .join(", ") || money(channel.shipping_cost)
                    : money(channel.shipping_cost)}
                </td>
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
          <ChannelForm channel={current} count={channels.length} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </>
  );
}
