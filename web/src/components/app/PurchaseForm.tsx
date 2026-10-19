"use client";

import { useState, type FormEvent } from "react";
import { useData, useSave } from "@/lib/data";
import { isoDay, money, num } from "@/lib/format";
import { amount, purchasesOf, UNIT_LABELS, unitCostLabel, type Item } from "@/lib/inventory";
import { supabase } from "@/lib/supabase";

/**
 * Purchase of a filament or another material: how much came in and what was paid in total. The
 * real cost per gram (or unit) is then the total paid ÷ the quantity bought over all purchases.
 */
export function PurchaseForm({ items, initial, onDone }: { items: Item[]; initial?: Item; onDone: () => void }) {
  const { suppliers, expenses } = useData();
  const { busy, error, setError, save } = useSave();
  const [key, setKey] = useState(initial ? `${initial.type}:${initial.id}` : items[0] ? `${items[0].type}:${items[0].id}` : "");
  const item = items.find((candidate) => `${candidate.type}:${candidate.id}` === key);
  const [quantity, setQuantity] = useState("1");
  const [inKilos, setInKilos] = useState(true);
  const [total, setTotal] = useState("");
  const [pickedSupplier, setPickedSupplier] = useState<string | null | undefined>(undefined);
  const supplierId = pickedSupplier === undefined ? (item?.supplierId ?? null) : pickedSupplier;
  const [date, setDate] = useState(isoDay());

  const isFilament = item?.type === "filament";
  const units = item ? num(quantity) * (isFilament && inKilos ? 1000 : 1) : 0;
  const paid = num(total);
  const thisCost = units > 0 ? paid / units : 0;
  // Same rule as the database: everything paid ÷ everything bought, this purchase included.
  const before = item ? purchasesOf(item, expenses) : { paid: 0, bought: 0 };
  const after = before.bought + units > 0 ? (before.paid + paid) / (before.bought + units) : 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!item) return setError("Elige qué compraste.");
    if (units <= 0) return setError("Indica cuánto compraste.");
    if (paid <= 0) return setError("Indica cuánto pagaste en total.");
    const common = { amount: paid, spent_at: date, supplier_id: supplierId, note: `Compra de ${item.name}` };
    save(
      () =>
        supabase()
          .from("expenses")
          .insert(isFilament ? { ...common, category: "filament", filament_id: item.id, grams: units } : { ...common, category: "material", material_id: item.id, quantity: units }),
      onDone,
    );
  }

  const groups = [
    { label: "Filamento", list: items.filter((candidate) => candidate.type === "filament") },
    { label: "Otros materiales", list: items.filter((candidate) => candidate.type === "material") },
  ];
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="label sm:col-span-2">
        Qué compraste
        <select className="input" value={key} onChange={(event) => setKey(event.target.value)} required>
          {groups
            .filter((group) => group.list.length)
            .map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.list.map((candidate) => (
                  <option key={candidate.id} value={`${candidate.type}:${candidate.id}`}>
                    {candidate.name} · tienes {amount(candidate, candidate.stock)}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </label>
      <label className="label">
        Cantidad que entró
        <div className="flex gap-2">
          <input className="input min-w-0 flex-1" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          {isFilament ? (
            <select className="input w-20" value={inKilos ? "kg" : "g"} onChange={(event) => setInKilos(event.target.value === "kg")} aria-label="Unidad">
              <option value="kg">kg</option>
              <option value="g">g</option>
            </select>
          ) : (
            <span className="self-center text-sm text-muted">{item ? UNIT_LABELS[item.unit] : ""}</span>
          )}
        </div>
      </label>
      <label className="label">
        Total pagado ($)
        <input className="input" inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="Lo que pagaste por todo" required />
      </label>
      <label className="label">
        Proveedor
        <select className="input" value={supplierId ?? ""} onChange={(event) => setPickedSupplier(event.target.value || null)}>
          <option value="">Sin proveedor</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Fecha
        <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
      </label>

      {item && units > 0 && paid > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm sm:col-span-2">
          <p>
            Esta compra sale a <strong>{unitCostLabel(item, thisCost)}</strong>
            {isFilament && <span className="text-muted"> ({money(thisCost * 1000)} por kg)</span>}.
          </p>
          <p className="text-muted">
            Costo actual con tus compras: {before.bought > 0 ? unitCostLabel(item, before.paid / before.bought) : "sin compras todavía"} →{" "}
            <strong className="text-white">{unitCostLabel(item, after)}</strong>. Existencia: {amount(item, item.stock)} → {amount(item, item.stock + units)}.
          </p>
          {item.referenceCost > 0 && (
            <p className="text-xs text-muted">
              Tu referencia: {unitCostLabel(item, item.referenceCost)}
              {thisCost > item.referenceCost * 1.1 ? " · esta compra salió más cara de lo normal." : thisCost < item.referenceCost * 0.9 ? " · esta compra salió más barata de lo normal." : "."}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Registrar compra"}
        </button>
        <span className="text-xs text-muted">Suma a tu existencia, recalcula el costo por gramo con tus compras y queda en Gastos.</span>
      </div>
    </form>
  );
}
