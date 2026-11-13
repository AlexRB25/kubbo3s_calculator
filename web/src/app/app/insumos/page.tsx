"use client";

import { useState } from "react";
import { materialFields } from "@/components/app/MaterialFields";
import { PurchaseForm } from "@/components/app/PurchaseForm";
import { CountForm, StockHistory } from "@/components/app/StockDialogs";
import { Empty, FieldsForm, Modal, PageHeader, Stat, TableCard } from "@/components/app/ui";
import { materialUnitCost } from "@/lib/costs";
import { useData } from "@/lib/data";
import { money } from "@/lib/format";
import { amount, materialItem, unitCostLabel, type Item } from "@/lib/inventory";
import { useSession } from "@/lib/session";
import { imageUrl, supabase, uploadProductImage } from "@/lib/supabase";
import type { Material } from "@/lib/types";

/** Photo of a supply: upload, change or take out. */
function MaterialPhoto({ photo, onPhoto }: { photo: string | null; onPhoto: (url: string | null) => void }) {
  const { shop } = useData();
  const { session } = useSession();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File | undefined) {
    if (!file || !session) return;
    if (file.size > 5 * 1024 * 1024) return setError("La foto debe pesar menos de 5 MB.");
    setError("");
    setUploading(true);
    const { path, error: failed } = await uploadProductImage(shop?.shop_id ?? session.user.id, file);
    setUploading(false);
    if (failed) return setError(`No se pudo subir la foto: ${failed.message}`);
    onPhoto(imageUrl(path));
  }

  return (
    <div className="flex items-center gap-3">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-raised">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- public photo in storage
          <img src={photo} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-xs text-muted">Sin foto</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-2">
          <label className="btn cursor-pointer px-3 py-1 text-xs">
            {uploading ? "Subiendo…" : photo ? "Cambiar foto" : "Subir foto"}
            <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(event) => upload(event.target.files?.[0])} />
          </label>
          {photo && (
            <button type="button" className="btn px-3 py-1 text-xs" onClick={() => onPhoto(null)}>
              Quitar foto
            </button>
          )}
        </div>
        {error && <p className="text-xs text-bad">{error}</p>}
      </div>
    </div>
  );
}

/**
 * Supplies that go into the products besides filament: LEDs, bulbs, screws, magnets… with what
 * they cost and how many there are. Products say how many of each they take; producing them takes
 * them out of here.
 */
export default function SuppliesPage() {
  const { materials, products, suppliers } = useData();
  const [buying, setBuying] = useState<Item | "any" | null>(null);
  const [adjusting, setAdjusting] = useState<Item | null>(null);
  const [history, setHistory] = useState<Item | null>(null);
  const [editing, setEditing] = useState<Material | "new" | null>(null);
  // Photo of the supply being edited; only sent when it changes (works before the column exists).
  const [photo, setPhoto] = useState<string | null>(null);
  const edit = (material: Material | "new") => {
    setPhoto(material === "new" ? null : (material.image_url ?? null));
    setEditing(material);
  };
  const items = materials.map(materialItem);
  const current = editing === "new" ? undefined : (editing ?? undefined);
  const usedIn = (material: Material) => products.filter((product) => product.materials?.some((use) => use.material_id === material.id));

  return (
    <>
      <PageHeader title="Insumos">
        <button className="btn" onClick={() => edit("new")}>
          Nuevo insumo
        </button>
        {items.length > 0 && (
          <button className="btn btn-primary" onClick={() => setBuying("any")}>
            Registrar compra
          </button>
        )}
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Valor de los insumos" value={money(materials.reduce((total, material) => total + Math.max(Number(material.stock), 0) * materialUnitCost(material), 0))} />
        <Stat label="Insumos" value={String(materials.length)} />
        <Stat
          label="Por reponer"
          value={String(items.filter((item) => item.low).length)}
          tone={items.some((item) => item.low) ? "bad" : undefined}
        />
      </section>

      {materials.length === 0 ? (
        <Empty>
          Da de alta lo que usas en tus productos además del filamento: LEDs, focos, tornillos, imanes… con su costo y cuántos tienes. Luego en cada producto
          indicas cuántos lleva: su costo se suma solo y se descuentan al producirlo.
        </Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Insumo</th>
                <th className="num">Existencia</th>
                <th className="num">Costo por unidad</th>
                <th className="num">Valor</th>
                <th>Se usa en</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {materials.map((material) => {
                const item = materialItem(material);
                const products = usedIn(material);
                return (
                  <tr key={material.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {material.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- public photo in storage
                          <img src={material.image_url} alt="" className="size-10 shrink-0 rounded-md border border-line object-cover" />
                        ) : null}
                        <span>
                          {material.name}
                          {material.category && <span className="block text-xs text-muted">{material.category}</span>}
                        </span>
                      </div>
                    </td>
                    <td className={`num font-semibold ${item.low ? "text-bad" : ""}`}>{amount(item, item.stock)}</td>
                    <td className="num">
                      {unitCostLabel(item, materialUnitCost(material))}
                      <span className="block text-xs text-muted">{item.fromPurchases ? "de tus compras" : "de referencia"}</span>
                    </td>
                    <td className="num">{money(Math.max(item.stock, 0) * materialUnitCost(material))}</td>
                    <td className="text-sm text-muted">{products.length ? products.map((product) => product.name).join(", ") : "—"}</td>
                    <td className="num">
                      <div className="flex justify-end gap-2">
                        <button className="btn" onClick={() => setBuying(item)}>
                          Comprar
                        </button>
                        <button className="btn" onClick={() => setAdjusting(item)}>
                          Arquear
                        </button>
                        <button className="btn" onClick={() => setHistory(item)}>
                          Historial
                        </button>
                        <button className="btn" onClick={() => edit(material)}>
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {buying && (
        <Modal title="Registrar compra de insumos" onClose={() => setBuying(null)} wide>
          <PurchaseForm items={items} initial={buying === "any" ? undefined : buying} onDone={() => setBuying(null)} />
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
        <Modal title={current ? current.name : "Nuevo insumo"} onClose={() => setEditing(null)} wide>
          <FieldsForm
            fields={materialFields(suppliers, editing === "new")}
            initial={current ?? { unit: "pza", stock: 0, cost_per_unit: 0, low_stock: 0 }}
            onDone={() => setEditing(null)}
            onSubmit={(values) => {
              const row = photo !== (current?.image_url ?? null) ? { ...values, image_url: photo } : values;
              return current ? supabase().from("materials").update(row).eq("id", current.id) : supabase().from("materials").insert(row);
            }}
            onDelete={current ? () => supabase().from("materials").delete().eq("id", current.id) : undefined}
            deleteConfirm="Sus compras se quedan en Gastos y los productos que lo usan dejarán de sumar su costo. ¿Eliminar este insumo?"
          >
            <MaterialPhoto photo={photo} onPhoto={setPhoto} />
          </FieldsForm>
        </Modal>
      )}
    </>
  );
}
