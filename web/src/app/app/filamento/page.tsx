"use client";

import { useState } from "react";
import { PurchaseForm } from "@/components/app/PurchaseForm";
import { CountForm, StockHistory } from "@/components/app/StockDialogs";
import { Empty, FieldsForm, Modal, PageHeader, Stat, TableCard, type FieldDef } from "@/components/app/ui";
import { costPerGram, filamentName } from "@/lib/costs";
import { useData } from "@/lib/data";
import { money, weight } from "@/lib/format";
import { filamentItem, preciseMoney } from "@/lib/inventory";
import { supabase } from "@/lib/supabase";
import type { Filament } from "@/lib/types";

export default function FilamentsPage() {
  const { filaments, suppliers } = useData();
  const [editing, setEditing] = useState<Filament | "new" | null>(null);
  const [buying, setBuying] = useState<Filament | "any" | null>(null);
  const [counting, setCounting] = useState<Filament | null>(null);
  const [history, setHistory] = useState<Filament | null>(null);

  const supplierOptions = suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }));
  const fields: FieldDef[] = [
    { name: "material", label: "Material", required: true, placeholder: "PLA, PETG, ABS, TPU…" },
    { name: "color", label: "Color", placeholder: "Negro mate" },
    { name: "brand", label: "Marca" },
    { name: "color_hex", label: "Color en las listas", type: "color" },
    // Stock is typed only when the filament is new; later it moves with purchases, prints and arqueos.
    ...(editing === "new"
      ? [{ name: "stock_g", label: "Existencia inicial (g)", type: "number" as const, hint: "Lo que ya tienes; queda en el historial como existencia inicial." }]
      : []),
    { name: "cost_per_kg", label: "Costo de referencia por kg ($)", type: "number", hint: "Lo que normalmente cuesta. El costo real por gramo sale de tus compras." },
    { name: "low_stock_g", label: "Avisarme al bajar de (g)", type: "number" },
    { name: "supplier_id", label: "Proveedor", type: "select", options: supplierOptions, none: "Sin proveedor" },
    { name: "notes", label: "Notas", type: "textarea", placeholder: "Temperaturas, secado…" },
  ];
  const totalGrams = filaments.reduce((total, filament) => total + Math.max(filament.stock_g, 0), 0);
  const totalValue = filaments.reduce((total, filament) => total + Math.max(filament.stock_g, 0) * costPerGram(filament), 0);
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
                  <th className="num">Referencia por kg</th>
                  <th className="num">Costo por g actual</th>
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
                    <td className="num text-muted">{filament.cost_per_kg > 0 ? money(filament.cost_per_kg) : "—"}</td>
                    <td className="num">
                      {filament.avg_cost_per_g > 0 ? (
                        <>
                          {preciseMoney(filament.avg_cost_per_g)}
                          <span className="block text-xs text-muted">{money(filament.avg_cost_per_g * 1000)} / kg · de tus compras</span>
                        </>
                      ) : (
                        <span className="text-muted">Sin compras</span>
                      )}
                    </td>
                    <td className={`num font-semibold ${filament.stock_g <= filament.low_stock_g ? "text-bad" : ""}`}>{weight(filament.stock_g)}</td>
                    <td className="num">
                      <div className="flex justify-end gap-2">
                        <button className="btn" onClick={() => setBuying(filament)}>
                          Comprar
                        </button>
                        <button className="btn" onClick={() => setCounting(filament)}>
                          Arquear
                        </button>
                        <button className="btn" onClick={() => setHistory(filament)}>
                          Historial
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
              // The stock is not edited here: it is corrected with an arqueo, which stays in the history.
              if (current) delete values.stock_g;
              return current ? supabase().from("filaments").update(values).eq("id", current.id) : supabase().from("filaments").insert(values);
            }}
            onDelete={current ? () => supabase().from("filaments").delete().eq("id", current.id) : undefined}
            deleteConfirm="El historial se conserva, pero los productos que usan este filamento dejarán de sumar su costo. ¿Eliminar?"
          />
        </Modal>
      )}

      {counting && (
        <Modal title={`Arquear · ${filamentName(counting)}`} onClose={() => setCounting(null)}>
          <CountForm item={filamentItem(counting)} onDone={() => setCounting(null)} />
        </Modal>
      )}
      {history && (
        <Modal title={`Movimientos · ${filamentName(history)}`} onClose={() => setHistory(null)} wide>
          <StockHistory item={filamentItem(history)} />
        </Modal>
      )}
      {buying && (
        <Modal title="Compra de filamento" onClose={() => setBuying(null)} wide>
          <PurchaseForm items={filaments.map(filamentItem)} initial={buying === "any" ? undefined : filamentItem(buying)} onDone={() => setBuying(null)} />
        </Modal>
      )}
    </>
  );
}
