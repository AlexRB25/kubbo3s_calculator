"use client";

import { useState } from "react";
import { Empty, FieldsForm, Modal, PageHeader, Stat, TableCard, type FieldDef } from "@/components/app/ui";
import { filamentName } from "@/lib/costs";
import { useData } from "@/lib/data";
import { isoDay, money, weight } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Filament } from "@/lib/types";

export default function FilamentsPage() {
  const { filaments, suppliers } = useData();
  const [editing, setEditing] = useState<Filament | "new" | null>(null);
  const [buying, setBuying] = useState<Filament | "any" | null>(null);

  const supplierOptions = suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }));
  const fields: FieldDef[] = [
    { name: "material", label: "Material", required: true, placeholder: "PLA, PETG, ABS, TPU…" },
    { name: "color", label: "Color", placeholder: "Negro mate" },
    { name: "brand", label: "Marca" },
    { name: "color_hex", label: "Color en las listas", type: "color" },
    { name: "stock_g", label: "En existencia (g)", type: "number", hint: "Las impresiones descuentan y las compras suman solas." },
    { name: "cost_per_kg", label: "Costo por kg ($)", type: "number" },
    { name: "low_stock_g", label: "Avisarme al bajar de (g)", type: "number" },
    { name: "supplier_id", label: "Proveedor", type: "select", options: supplierOptions, none: "Sin proveedor" },
    { name: "notes", label: "Notas", type: "textarea", placeholder: "Temperaturas, secado…" },
  ];
  const purchaseFields: FieldDef[] = [
    {
      name: "filament_id",
      label: "Filamento",
      type: "select",
      required: true,
      wide: true,
      options: filaments.map((filament) => ({ value: filament.id, label: `${filamentName(filament)} · quedan ${weight(filament.stock_g)}` })),
    },
    { name: "grams", label: "Cantidad (g)", type: "number", required: true },
    { name: "amount", label: "Total pagado ($)", type: "number", required: true },
    { name: "supplier_id", label: "Proveedor", type: "select", options: supplierOptions, none: "Sin proveedor" },
    { name: "spent_at", label: "Fecha", type: "date", required: true },
  ];

  const totalGrams = filaments.reduce((total, filament) => total + Math.max(filament.stock_g, 0), 0);
  const totalValue = filaments.reduce((total, filament) => total + (Math.max(filament.stock_g, 0) / 1000) * filament.cost_per_kg, 0);
  const current = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <>
      <PageHeader title="Filamento">
        {filaments.length > 0 && (
          <button className="btn" onClick={() => setBuying("any")}>
            Registrar compra
          </button>
        )}
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo filamento
        </button>
      </PageHeader>

      {filaments.length === 0 ? (
        <Empty>Registra tus filamentos para llevar cuántos gramos te quedan y cuánto cuesta cada pieza.</Empty>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="En existencia" value={weight(totalGrams)} />
            <Stat label="Valor del inventario" value={money(totalValue)} />
          </section>
          <TableCard>
            <table className="table">
              <thead>
                <tr>
                  <th>Filamento</th>
                  <th>Proveedor</th>
                  <th className="num">Costo por kg</th>
                  <th className="num">Existencia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filaments.map((filament) => (
                  <tr key={filament.id}>
                    <td>
                      <span className="mr-2 inline-block size-4 rounded-full border border-line align-middle" style={{ background: filament.color_hex }} />
                      {filamentName(filament)}
                    </td>
                    <td className="text-muted">{suppliers.find((supplier) => supplier.id === filament.supplier_id)?.name ?? "—"}</td>
                    <td className="num">{money(filament.cost_per_kg)}</td>
                    <td className={`num font-semibold ${filament.stock_g <= filament.low_stock_g ? "text-bad" : ""}`}>{weight(filament.stock_g)}</td>
                    <td className="num">
                      <div className="flex justify-end gap-2">
                        <button className="btn" onClick={() => setBuying(filament)}>
                          Comprar
                        </button>
                        <button className="btn" onClick={() => setEditing(filament)}>
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {editing && (
        <Modal title={current ? filamentName(current) : "Nuevo filamento"} onClose={() => setEditing(null)}>
          <FieldsForm
            fields={fields}
            initial={current ?? { material: "PLA", color_hex: "#ffffff", low_stock_g: 200 }}
            onDone={() => setEditing(null)}
            onSubmit={(values) => {
              // Prints and purchases move the stock on the server; send it only when it was corrected here.
              if (current && values.stock_g === current.stock_g) delete values.stock_g;
              return current ? supabase().from("filaments").update(values).eq("id", current.id) : supabase().from("filaments").insert(values);
            }}
            onDelete={current ? () => supabase().from("filaments").delete().eq("id", current.id) : undefined}
            deleteConfirm="El historial se conserva, pero los productos que usan este filamento dejarán de sumar su costo. ¿Eliminar?"
          />
        </Modal>
      )}

      {buying && (
        <Modal title="Compra de filamento" onClose={() => setBuying(null)}>
          <FieldsForm
            fields={purchaseFields}
            initial={{
              filament_id: buying === "any" ? filaments[0]?.id : buying.id,
              supplier_id: buying === "any" ? null : buying.supplier_id,
              grams: 1000,
              spent_at: isoDay(),
            }}
            submitLabel="Registrar compra"
            onDone={() => setBuying(null)}
            onSubmit={(values) => {
              const filament = filaments.find((item) => item.id === values.filament_id);
              return supabase()
                .from("expenses")
                .insert({ ...values, category: "filament", note: `Compra de ${filament ? filamentName(filament) : "filamento"}` });
            }}
          >
            <p className="text-xs text-muted">
              La compra suma los gramos a tu existencia, recalcula el costo por kg como promedio y queda registrada como gasto.
            </p>
          </FieldsForm>
        </Modal>
      )}
    </>
  );
}
