import type { FieldDef } from "@/components/app/ui";
import type { Supplier } from "@/lib/types";

/**
 * The form of a supply or raw material (LEDs, bulbs, screws, magnets, resin…). Stock is only typed
 * once, when it is new; later it moves with purchases, production and arqueos.
 */
export function materialFields(suppliers: Supplier[], isNew: boolean): FieldDef[] {
  return [
    { name: "name", label: "Nombre", required: true, wide: true, placeholder: "LED 5 mm blanco, foco E14, tornillo M3×10, imán 6×2…" },
    { name: "category", label: "Tipo", placeholder: "Iluminación, tornillería, imanes, resina…" },
    {
      name: "unit",
      label: "Se cuenta en",
      type: "select",
      required: true,
      options: [
        { value: "pza", label: "Piezas" },
        { value: "g", label: "Gramos" },
        { value: "ml", label: "Mililitros" },
      ],
    },
    ...(isNew ? [{ name: "stock", label: "Existencia inicial", type: "number" as const, hint: "Lo que ya tienes; queda en el historial como existencia inicial." }] : []),
    { name: "cost_per_unit", label: "Costo de referencia por unidad ($)", type: "number", hint: "Lo que normalmente cuesta. El costo real sale de tus compras." },
    { name: "low_stock", label: "Avisarme al bajar de", type: "number" },
    { name: "supplier_id", label: "Proveedor", type: "select", options: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })), none: "Sin proveedor" },
    { name: "notes", label: "Notas", type: "textarea", wide: true },
  ];
}
