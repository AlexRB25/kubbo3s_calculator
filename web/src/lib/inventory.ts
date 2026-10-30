import { costPerGram, filamentName } from "./costs";
import { money, weight } from "./format";
import { filamentColors } from "./labels";
import type { Expense, Filament, InventoryItemType, Material } from "./types";

/** Anything with stock: a filament, another material or a finished product. */
export type Item = {
  type: InventoryItemType;
  id: string;
  name: string;
  detail: string;
  /** Colours of a filament, the main one first. */
  colors?: string[];
  glow?: boolean;
  unit: "g" | "ml" | "pza";
  stock: number;
  /** Real cost of one gram, millilitre or piece (from purchases; the reference while there are none). */
  unitCost: number;
  /** What one unit usually costs, as the user typed it. */
  referenceCost: number;
  /** Whether unitCost comes from real purchases. */
  fromPurchases: boolean;
  low: boolean;
  supplierId: string | null;
};

export const UNIT_LABELS: Record<Item["unit"], string> = { g: "gramos", ml: "mililitros", pza: "piezas" };

const fine = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** Money with up to four decimals, for the cost of a gram. */
export const preciseMoney = (value: number) => fine.format(Number(value) || 0);

/** "1.25 kg", "30 ml", "12 pzas". */
export function amount(item: Pick<Item, "unit">, value: number) {
  if (item.unit === "g") return weight(value);
  const rounded = Math.round(value * 1000) / 1000;
  return item.unit === "ml" ? `${rounded} ml` : `${rounded} ${Math.abs(rounded) === 1 ? "pza" : "pzas"}`;
}

/** "$0.3091 / g", "$5.00 / pza". */
export function unitCostLabel(item: Pick<Item, "unit">, cost: number) {
  return item.unit === "pza" ? `${money(cost)} / pza` : `${preciseMoney(cost)} / ${item.unit}`;
}

export const filamentItem = (filament: Filament): Item => ({
  type: "filament",
  id: filament.id,
  name: filamentName(filament),
  detail: "Filamento",
  colors: filamentColors(filament),
  glow: filament.glow,
  unit: "g",
  stock: filament.stock_g,
  unitCost: costPerGram(filament),
  referenceCost: filament.cost_per_kg / 1000,
  fromPurchases: filament.avg_cost_per_g > 0,
  low: filament.stock_g <= filament.low_stock_g,
  supplierId: filament.supplier_id,
});

export const materialItem = (material: Material): Item => ({
  type: "material",
  id: material.id,
  name: material.name,
  detail: material.category || "Material",
  unit: material.unit,
  stock: material.stock,
  unitCost: material.avg_cost_per_unit > 0 ? Number(material.avg_cost_per_unit) : material.cost_per_unit,
  referenceCost: material.cost_per_unit,
  fromPurchases: material.avg_cost_per_unit > 0,
  low: material.low_stock > 0 && material.stock <= material.low_stock,
  supplierId: material.supplier_id,
});

/** Everything paid and bought of an item so far (from the expenses on screen), to preview the new real cost. */
export function purchasesOf(item: Pick<Item, "type" | "id">, expenses: Expense[]) {
  let paid = 0;
  let bought = 0;
  for (const expense of expenses) {
    if (item.type === "filament" && expense.filament_id === item.id && expense.grams) {
      paid += Number(expense.amount);
      bought += Number(expense.grams);
    } else if (item.type === "material" && expense.material_id === item.id && expense.quantity) {
      paid += Number(expense.amount);
      bought += Number(expense.quantity);
    }
  }
  return { paid, bought };
}
