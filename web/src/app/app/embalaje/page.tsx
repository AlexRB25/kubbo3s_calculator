"use client";

import { useState } from "react";
import { BoxPreview } from "@/components/app/BoxPreview";
import { PackagingCatalog } from "@/components/app/PackagingCatalog";
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

/** How the box is drawn in 3D; only once the database has these columns. */
const SHAPE_FIELDS: FieldDef[] = [
  {
    name: "style",
    label: "Forma",
    type: "select",
    required: true,
    options: [
      { value: "rsc", label: "Caja de envío (4 solapas)" },
      { value: "mailer", label: "Con tapa (maletín, pizza)" },
    ],
  },
  {
    name: "material",
    label: "Color",
    type: "select",
    required: true,
    options: [
      { value: "kraft", label: "Kraft (café)" },
      { value: "blanca", label: "Blanca" },
      { value: "negra", label: "Negra" },
    ],
  },
];

// Measures are typed in centimetres and stored in millimetres.
const toForm = (item: Packaging) => ({ ...item, length: item.length_mm / 10, width: item.width_mm / 10, height: item.height_mm / 10 });

export default function PackagingPage() {
  const { packaging, products, profile } = useData();
  const [editing, setEditing] = useState<Packaging | "new" | null>(null);
  const [browsing, setBrowsing] = useState(false);
  // The catalog and the 3D shape came with the same database update as the clients.
  const withShapes = profile?.client_fields !== undefined;
  const fields = withShapes ? [...FIELDS.slice(0, 2), ...SHAPE_FIELDS, ...FIELDS.slice(2)] : FIELDS;
  const current = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <>
      <PageHeader title="Embalaje">
        {withShapes && (
          <button className="btn btn-primary" onClick={() => setBrowsing(true)}>
            Del catálogo Kubbo
          </button>
        )}
        <button className={withShapes ? "btn" : "btn btn-primary"} onClick={() => setEditing("new")}>
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
          {current && current.length_mm > 0 && current.width_mm > 0 && current.height_mm > 0 && (
            <div className="mb-4">
              <BoxPreview length_mm={current.length_mm} width_mm={current.width_mm} height_mm={current.height_mm} style={current.style} material={current.material} size={200} />
            </div>
          )}
          <FieldsForm
            fields={fields}
            initial={current ? toForm(current) : { kind: "box", stock: 0, weight_g: 0, style: "rsc", material: "kraft" }}
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

      {browsing && (
        <Modal title="Catálogo de empaques Kubbo" wide onClose={() => setBrowsing(false)}>
          <PackagingCatalog onDone={() => setBrowsing(false)} />
        </Modal>
      )}
    </>
  );
}
