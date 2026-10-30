"use client";

import Link from "next/link";
import { useState } from "react";
import { PurchaseForm } from "@/components/app/PurchaseForm";
import { CountForm, StockHistory } from "@/components/app/StockDialogs";
import { materialFields } from "@/components/app/MaterialFields";
import { Swatch } from "@/components/app/Swatch";
import { Empty, FieldsForm, Modal, PageHeader, Stat, TableCard } from "@/components/app/ui";
import { productCost } from "@/lib/costs";
import { useData } from "@/lib/data";
import { money, weight } from "@/lib/format";
import { amount, filamentItem, materialItem, unitCostLabel, type Item } from "@/lib/inventory";
import { supabase } from "@/lib/supabase";
import type { Material } from "@/lib/types";

export default function InventoryPage() {
  const { filaments, materials, products, printers, suppliers, profile } = useData();
  const [tab, setTab] = useState<"raw" | "products">("raw");
  const [buying, setBuying] = useState<Item | "any" | null>(null);
  const [adjusting, setAdjusting] = useState<Item | null>(null);
  const [history, setHistory] = useState<Item | null>(null);
  const [editing, setEditing] = useState<Material | "new" | null>(null);

  const raw: Item[] = [...filaments.map(filamentItem), ...materials.map(materialItem)];
  const finished: Item[] = products.map((product) => {
    const cost = productCost(product, filaments, printers, profile?.kwh_price ?? 0, materials, profile?.waste_rules).total;
    return {
      type: "product" as const,
      id: product.id,
      name: product.name,
      detail: product.sku,
      unit: "pza" as const,
      stock: product.stock,
      unitCost: cost,
      referenceCost: cost,
      fromPurchases: false,
      low: product.stock <= 0,
      supplierId: null,
    };
  });
  const value = (items: Item[]) => items.reduce((total, item) => total + Math.max(item.stock, 0) * item.unitCost, 0);
  const shown = tab === "raw" ? raw : finished;

  const currentMaterial = editing === "new" ? undefined : (editing ?? undefined);
  const tabClass = "rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:bg-raised aria-selected:bg-brand aria-selected:text-ink";

  return (
    <>
      <PageHeader title="Inventario">
        {tab === "raw" && (
          <>
            <button className="btn" onClick={() => setEditing("new")}>
              Nuevo material
            </button>
            <Link className="btn" href="/app/filamento">
              Nuevo filamento
            </Link>
            {raw.length > 0 && (
              <button className="btn btn-primary" onClick={() => setBuying("any")}>
                Registrar compra
              </button>
            )}
          </>
        )}
      </PageHeader>

      <div role="tablist" aria-label="Tipo de inventario" className="flex gap-2">
        <button role="tab" aria-selected={tab === "raw"} className={tabClass} onClick={() => setTab("raw")}>
          Materia prima
        </button>
        <button role="tab" aria-selected={tab === "products"} className={tabClass} onClick={() => setTab("products")}>
          Productos terminados
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tab === "raw" ? (
          <>
            <Stat label="Valor de la materia prima" value={money(value(raw))} />
            <Stat label="Filamento en existencia" value={weight(filaments.reduce((total, filament) => total + Math.max(filament.stock_g, 0), 0))} />
            <Stat label="Por reponer" value={String(raw.filter((item) => item.low).length)} tone={raw.some((item) => item.low) ? "bad" : undefined} />
          </>
        ) : (
          <>
            <Stat label="Valor de lo terminado (a costo)" value={money(value(finished))} />
            <Stat label="Piezas en existencia" value={String(finished.reduce((total, item) => total + Math.max(item.stock, 0), 0))} />
            <Stat label="Agotados" value={String(finished.filter((item) => item.stock <= 0).length)} tone={finished.some((item) => item.stock <= 0) ? "bad" : undefined} />
          </>
        )}
      </section>

      {shown.length === 0 ? (
        <Empty>
          {tab === "raw"
            ? "Da de alta tus filamentos (en Filamento) y otros materiales; después registra aquí cada compra con lo que pagaste y se calcula el costo por gramo."
            : "Cuando tengas productos, aquí ves cuántos hay terminados: suben con las impresiones y bajan con las ventas."}
        </Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>{tab === "raw" ? "Material" : "Producto"}</th>
                <th className="num">Existencia</th>
                <th className="num">{tab === "raw" ? "Costo actual (compras)" : "Costo por pieza"}</th>
                {tab === "raw" && <th className="num">Referencia</th>}
                <th className="num">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={`${item.type}-${item.id}`}>
                  <td>
                    {item.colors && <Swatch colors={item.colors} glow={item.glow} className="mr-2 inline-block size-4 rounded-full border border-line align-middle" />}
                    {item.name}
                    {item.detail && <span className="block text-xs text-muted">{item.detail}</span>}
                  </td>
                  <td className={`num font-semibold ${item.low ? "text-bad" : ""}`}>{amount(item, item.stock)}</td>
                  <td className="num">
                    {item.type === "product" || item.fromPurchases ? unitCostLabel(item, item.unitCost) : <span className="text-muted">Sin compras</span>}
                    {item.type === "filament" && item.fromPurchases && <span className="block text-xs text-muted">{money(item.unitCost * 1000)} / kg</span>}
                  </td>
                  {tab === "raw" && (
                    <td className="num text-muted">
                      {item.referenceCost > 0 ? (item.type === "filament" ? `${money(item.referenceCost * 1000)} / kg` : unitCostLabel(item, item.referenceCost)) : "—"}
                    </td>
                  )}
                  <td className="num">{money(Math.max(item.stock, 0) * item.unitCost)}</td>
                  <td className="num">
                    <div className="flex justify-end gap-2">
                      {item.type !== "product" && (
                        <button className="btn" onClick={() => setBuying(item)}>
                          Comprar
                        </button>
                      )}
                      <button className="btn" onClick={() => setAdjusting(item)}>
                        Arquear
                      </button>
                      <button className="btn" onClick={() => setHistory(item)}>
                        Historial
                      </button>
                      {item.type === "material" && (
                        <button className="btn" onClick={() => setEditing(materials.find((material) => material.id === item.id) ?? null)}>
                          Editar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {buying && (
        <Modal title="Registrar compra de materia prima" onClose={() => setBuying(null)} wide>
          <PurchaseForm items={raw} initial={buying === "any" ? undefined : buying} onDone={() => setBuying(null)} />
        </Modal>
      )}
      {adjusting && (
        <Modal title={`Arquear · ${adjusting.name}`} onClose={() => setAdjusting(null)}>
          <CountForm item={adjusting} onDone={() => setAdjusting(null)} />
        </Modal>
      )}
      {history && (
        <Modal title={`Movimientos · ${history.name}`} onClose={() => setHistory(null)} wide>
          <StockHistory item={history} />
        </Modal>
      )}
      {editing && (
        <Modal title={currentMaterial ? currentMaterial.name : "Nuevo material"} onClose={() => setEditing(null)} wide>
          <FieldsForm
            fields={materialFields(suppliers, editing === "new")}
            initial={currentMaterial ?? { unit: "pza", stock: 0, cost_per_unit: 0, low_stock: 0 }}
            onDone={() => setEditing(null)}
            onSubmit={(values) => {
              return currentMaterial
                ? supabase().from("materials").update(values).eq("id", currentMaterial.id)
                : supabase().from("materials").insert(values);
            }}
            onDelete={currentMaterial ? () => supabase().from("materials").delete().eq("id", currentMaterial.id) : undefined}
            deleteConfirm="Sus compras se quedan en Gastos. ¿Eliminar este material?"
          />
        </Modal>
      )}
    </>
  );
}
