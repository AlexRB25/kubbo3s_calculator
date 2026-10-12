"use client";

import { useState } from "react";
import { Empty, FieldsForm, Modal, PageHeader, TableCard, type FieldDef } from "@/components/app/ui";
import { useData } from "@/lib/data";
import { money } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Supplier } from "@/lib/types";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Nombre", required: true },
  { name: "contact", label: "Contacto", placeholder: "Persona o correo" },
  { name: "phone", label: "Teléfono o WhatsApp" },
  { name: "url", label: "Tienda o sitio web" },
  { name: "notes", label: "Notas", type: "textarea", placeholder: "Tiempos de entrega, descuentos…" },
];

export default function SuppliersPage() {
  const { suppliers, expenses } = useData();
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const current = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <>
      <PageHeader title="Proveedores">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo proveedor
        </button>
      </PageHeader>

      {suppliers.length === 0 ? (
        <Empty>Guarda a quién le compras filamento y refacciones para saber cuánto llevas con cada uno.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Contacto</th>
                <th>Sitio</th>
                <th className="num">Comprado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td className="text-muted">{[supplier.contact, supplier.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="text-muted">{supplier.url || "—"}</td>
                  <td className="num">
                    {money(expenses.filter((expense) => expense.supplier_id === supplier.id).reduce((total, expense) => total + expense.amount, 0))}
                  </td>
                  <td className="num">
                    <button className="btn" onClick={() => setEditing(supplier)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {editing && (
        <Modal title={current?.name ?? "Nuevo proveedor"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={FIELDS}
            initial={current}
            onDone={() => setEditing(null)}
            onSubmit={(values) =>
              current ? supabase().from("suppliers").update(values).eq("id", current.id) : supabase().from("suppliers").insert(values)
            }
            onDelete={current ? () => supabase().from("suppliers").delete().eq("id", current.id) : undefined}
            deleteConfirm="Tus compras y gastos se conservan sin proveedor. ¿Eliminar?"
          />
        </Modal>
      )}
    </>
  );
}
