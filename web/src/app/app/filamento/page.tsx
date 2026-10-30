"use client";

import { useState } from "react";
import { PurchaseForm } from "@/components/app/PurchaseForm";
import { CountForm, StockHistory } from "@/components/app/StockDialogs";
import { FilamentForm } from "@/components/app/FilamentForm";
import { Swatch } from "@/components/app/Swatch";
import { Empty, Modal, PageHeader, Stat, TableCard } from "@/components/app/ui";
import { costPerGram, filamentName } from "@/lib/costs";
import { useData } from "@/lib/data";
import { money, weight } from "@/lib/format";
import { filamentItem, preciseMoney } from "@/lib/inventory";
import { filamentColors } from "@/lib/labels";
import type { Filament } from "@/lib/types";

export default function FilamentsPage() {
  const { filaments, suppliers } = useData();
  const [editing, setEditing] = useState<Filament | "new" | null>(null);
  const [buying, setBuying] = useState<Filament | "any" | null>(null);
  const [counting, setCounting] = useState<Filament | null>(null);
  const [history, setHistory] = useState<Filament | null>(null);

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
                      <span className="flex items-center gap-3">
                        <Swatch colors={filamentColors(filament)} glow={filament.glow} className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-line">
                          {filament.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element -- public photo of the spool
                            <img src={filament.image_url} alt="" className="absolute inset-0 size-full object-cover" />
                          )}
                        </Swatch>
                        <span>
                          {filamentName(filament)}
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <Swatch colors={filamentColors(filament)} glow={filament.glow} className="inline-block size-3 shrink-0 rounded-full border border-line" />
                            {filament.color || "Sin nombre de color"}
                          </span>
                        </span>
                      </span>
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
        <Modal title={current ? filamentName(current) : "Nuevo filamento"} onClose={() => setEditing(null)} wide>
          <FilamentForm filament={current} onDone={() => setEditing(null)} />
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
