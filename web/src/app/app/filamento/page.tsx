"use client";

import { useState } from "react";
import { PurchaseForm } from "@/components/app/PurchaseForm";
import { CountForm, StockHistory } from "@/components/app/StockDialogs";
import { FilamentCatalog } from "@/components/app/FilamentCatalog";
import { FilamentForm } from "@/components/app/FilamentForm";
import { Swatch } from "@/components/app/Swatch";
import { Empty, Modal, PageHeader, Stat, TableCard } from "@/components/app/ui";
import { costPerGram, filamentName, isResin, unitOf } from "@/lib/costs";
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
  const [importing, setImporting] = useState(false);

  const totalGrams = filaments.filter((filament) => !isResin(filament)).reduce((total, filament) => total + Math.max(filament.stock_g, 0), 0);
  const totalMl = filaments.filter(isResin).reduce((total, filament) => total + Math.max(filament.stock_g, 0), 0);
  const totalValue = filaments.reduce((total, filament) => total + Math.max(filament.stock_g, 0) * costPerGram(filament), 0);
  const current = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <>
      <PageHeader title="Filamento y resina">
        {filaments.length > 0 && (
          <button className="btn" onClick={() => setBuying("any")}>
            Registrar compra
          </button>
        )}
        <button className="btn" onClick={() => setImporting(true)}>
          Importar del catálogo
        </button>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          Nuevo filamento o resina
        </button>
      </PageHeader>

      {filaments.length === 0 ? (
        <Empty>Registra tus filamentos y resinas para llevar cuántos gramos o ml te quedan y cuánto cuesta cada pieza.</Empty>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={totalMl ? "Filamento en existencia" : "En existencia"} value={weight(totalGrams)} />
            {totalMl > 0 && <Stat label="Resina en existencia" value={weight(totalMl, true)} />}
            <Stat label="Valor del inventario" value={money(totalValue)} />
          </section>
          <TableCard>
            <table className="table">
              <thead>
                <tr>
                  <th>Filamento</th>
                  <th>Proveedor</th>
                  <th className="num">Referencia por kg / L</th>
                  <th className="num">Costo por g / ml actual</th>
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
                            {isResin(filament) && <span className="rounded bg-brand/15 px-1.5 text-brand">Resina</span>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="text-muted">{suppliers.find((supplier) => supplier.id === filament.supplier_id)?.name ?? "—"}</td>
                    <td className="num text-muted">{filament.cost_per_kg > 0 ? `${money(filament.cost_per_kg)} / ${isResin(filament) ? "L" : "kg"}` : "—"}</td>
                    <td className="num">
                      {filament.avg_cost_per_g > 0 ? (
                        <>
                          {preciseMoney(filament.avg_cost_per_g)} / {unitOf(filament)}
                          <span className="block text-xs text-muted">
                            {money(filament.avg_cost_per_g * 1000)} / {isResin(filament) ? "L" : "kg"} · de tus compras
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">Sin compras</span>
                      )}
                    </td>
                    <td className={`num font-semibold ${filament.stock_g <= filament.low_stock_g ? "text-bad" : ""}`}>{weight(filament.stock_g, isResin(filament))}</td>
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

      {importing && (
        <Modal title="Importar filamentos del catálogo Kubbo" onClose={() => setImporting(false)} wide>
          <FilamentCatalog onDone={() => setImporting(false)} />
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
