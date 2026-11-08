"use client";

import { useState } from "react";
import { ClientForm, FieldsSettings } from "@/components/app/Clients";
import { Empty, Modal, PageHeader, TableCard } from "@/components/app/ui";
import { taxLabel } from "@/lib/clients";
import { useData } from "@/lib/data";
import { getWorkshopCurrency, moneyIn } from "@/lib/format";
import { quoteTotals } from "@/lib/quotes";
import type { Currency } from "@/lib/currency";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  const { clients, quotes, profile, shop } = useData();
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [configuring, setConfiguring] = useState(false);
  const settings = profile?.client_fields ?? {};
  const label = taxLabel(settings, getWorkshopCurrency());
  const missingSchema = profile && profile.client_fields === undefined;

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? clients.filter((client) => [client.name, client.legal_name, client.tax_id, client.phone, client.email, client.city].some((text) => text.toLowerCase().includes(needle)))
    : clients;

  return (
    <>
      <PageHeader title="Clientes">
        {shop?.role === "owner" && (
          <button className="btn" onClick={() => setConfiguring(true)}>
            Campos de facturación
          </button>
        )}
        <button className="btn btn-primary" disabled={!!missingSchema} onClick={() => setEditing("new")}>
          Nuevo cliente
        </button>
      </PageHeader>
      <p className="text-sm text-muted">
        Tus clientes con sus datos de contacto y de facturación. Al cotizar los eliges de aquí y sus datos salen en el PDF. Los campos de facturación los defines
        tú, según lo que pida tu país.
      </p>
      {missingSchema && <p className="error">Falta actualizar la base de datos (supabase/schema.sql) para guardar clientes.</p>}

      {clients.length > 0 && (
        <input className="input max-w-sm" placeholder="Buscar por nombre, teléfono, correo o ID fiscal" value={query} onChange={(event) => setQuery(event.target.value)} />
      )}

      {clients.length === 0 ? (
        <Empty>Aquí aparecen tus clientes. Dalos de alta aquí o desde una cotización.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>{label}</th>
                <th>Contacto</th>
                <th className="num">Cotizado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((client) => {
                const theirs = quotes.filter((quote) => quote.client_id === client.id);
                const accepted = theirs.filter((quote) => quote.status === "accepted");
                const currency = (theirs[0]?.currency ?? getWorkshopCurrency()) as Currency;
                return (
                  <tr key={client.id}>
                    <td>
                      <span className="font-semibold">{client.name}</span>
                      {client.legal_name && client.legal_name !== client.name && <span className="block text-xs text-muted">{client.legal_name}</span>}
                    </td>
                    <td className="text-muted">{client.tax_id || "—"}</td>
                    <td className="text-muted">{[client.phone, client.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="num">
                      {theirs.length ? (
                        <>
                          {theirs.length} {theirs.length === 1 ? "cotización" : "cotizaciones"}
                          {accepted.length > 0 && (
                            <span className="block text-xs text-money">
                              {moneyIn(
                                accepted.reduce((total, quote) => total + quoteTotals(quote).total, 0),
                                currency,
                              )}{" "}
                              aceptado
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      <button className="btn" onClick={() => setEditing(client)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {editing && (
        <Modal title={editing === "new" ? "Nuevo cliente" : editing.name} wide onClose={() => setEditing(null)}>
          <ClientForm client={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
      {configuring && (
        <Modal title="Campos de facturación" onClose={() => setConfiguring(false)}>
          <FieldsSettings settings={settings} onDone={() => setConfiguring(false)} />
        </Modal>
      )}
    </>
  );
}
