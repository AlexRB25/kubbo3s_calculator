"use client";

import { useState } from "react";
import { Empty, FieldsForm, Modal, PageHeader, TableCard, type FieldDef } from "@/components/app/ui";
import { packagingName } from "@/lib/costs";
import { useData } from "@/lib/data";
import { money } from "@/lib/format";
import { PACKAGING_KINDS } from "@/lib/labels";
import { supabase } from "@/lib/supabase";
import type { Packaging } from "@/lib/types";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Nombre", required: true, placeholder: "Caja chica kraft" },
  { name: "kind", label: "Tipo", type: "select", required: true, options: PACKAGING_KINDS },
  { name: "length", label: "Largo (cm)", type: "number" },
  { name: "width", label: "Ancho (cm)", type: "number" },
  { name: "height", label: "Alto (cm)", type: "number" },
  { name: "cost", label: "Costo por pieza ($)", type: "number", hint: "Incluye relleno, cinta o etiqueta si los usas con este empaque." },
  { name: "stock", label: "Piezas que tienes", type: "number", hint: "Baja una con cada venta con envío de un producto que lo usa." },
  { name: "weight_g", label: "Peso del empaque (g)", type: "number", hint: "Vacío. Se suma al peso del producto para el envío." },
  { name: "notes", label: "Notas", type: "textarea", placeholder: "Proveedor, para qué productos sirve…" },
];

// Measures are typed in centimetres and stored in millimetres.
const toForm = (item: Packaging) => ({ ...item, length: item.length_mm / 10, width: item.width_mm / 10, height: item.height_mm / 10 });

export default function PackagingPage() {
  const { packaging, products } = useData();
  const [editing, setEditing] = useState<Packaging | "new" | null>(null);
  const current = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <>
      <PageHeader title="Embalaje">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo embalaje
        </button>
      </PageHeader>
      <p className="text-sm text-muted">
        Cajas, sobres y bolsas con su costo, cuántas tienes y lo que pesan. Asígnalos a cada producto para calcular su precio
        y peso con envío; en las ventas con envío se descuentan solos.
      </p>

      {packaging.length === 0 ? (
        <Empty>Registra tu primer embalaje con sus medidas y su costo.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Embalaje</th>
                <th>Tipo</th>
                <th className="num">Productos</th>
                <th className="num">Tienes</th>
                <th className="num">Peso</th>
                <th className="num">Costo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {packaging.map((item) => (
                <tr key={item.id}>
                  <td>
                    {packagingName(item)}
                    {item.notes && <div className="text-xs text-muted">{item.notes}</div>}
                  </td>
                  <td className="text-muted">{PACKAGING_KINDS.find((kind) => kind.value === item.kind)?.label}</td>
                  <td className="num">{products.filter((product) => product.packaging_id === item.id).length}</td>
                  <td className={`num font-semibold ${(item.stock ?? 0) <= 0 ? "text-bad" : ""}`}>{item.stock ?? 0}</td>
                  <td className="num text-muted">{item.weight_g > 0 ? `${Number(item.weight_g)} g` : "—"}</td>
                  <td className="num">{money(item.cost)}</td>
                  <td className="num">
                    <button className="btn" onClick={() => setEditing(item)}>
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
        <Modal title={current?.name ?? "Nuevo embalaje"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={FIELDS}
            initial={current ? toForm(current) : { kind: "box", stock: 0, weight_g: 0 }}
            onDone={() => setEditing(null)}
            onSubmit={({ length, width, height, ...values }) => {
              const row = { ...values, length_mm: Number(length) * 10, width_mm: Number(width) * 10, height_mm: Number(height) * 10 };
              return current ? supabase().from("packaging").update(row).eq("id", current.id) : supabase().from("packaging").insert(row);
            }}
            onDelete={current ? () => supabase().from("packaging").delete().eq("id", current.id) : undefined}
            deleteConfirm="Los productos que lo usan quedarán sin embalaje. ¿Eliminar?"
          />
        </Modal>
      )}
    </>
  );
}
