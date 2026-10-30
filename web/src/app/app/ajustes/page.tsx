"use client";

import { OverheadCosts } from "@/components/app/OverheadCosts";
import { WasteRules } from "@/components/app/WasteRules";
import { FieldsForm, PageHeader, type FieldDef } from "@/components/app/ui";
import { CURRENCIES } from "@/lib/currency";
import { useData } from "@/lib/data";
import { supabase } from "@/lib/supabase";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Tu nombre" },
  { name: "business_name", label: "Nombre del negocio" },
  {
    name: "currency",
    label: "Moneda",
    type: "select",
    options: CURRENCIES.map((currency) => ({ value: currency.code, label: currency.label })),
    hint: "Tus costos y precios se escriben y se muestran en ella. Lo que te recomendamos en pesos mexicanos (como el precio de referencia de los filamentos del catálogo) se convierte al tipo de cambio del día. Cambiarla no convierte lo que ya escribiste.",
    wide: true,
  },
  {
    name: "kwh_price",
    label: "Precio de la luz por kWh ($)",
    type: "number",
    hint: "Viene en tu recibo. Con el consumo de cada impresora suma la electricidad al costo de las piezas.",
  },
  {
    name: "margin_pct",
    label: "Ganancia deseada sobre la venta (%)",
    type: "number",
    hint: "Lo que te queda del precio de venta ya pagados producción, comisiones e impuestos (el envío aparte). Vendes en $100, te cuesta $50: ganas 50%.",
  },
];

export default function SettingsPage() {
  const { profile, shop } = useData();
  // Settings are the owner's: they set the costs and prices of the whole shop.
  if (shop && shop.role !== "owner") return <p className="text-muted">Los ajustes de la tienda (luz, ganancia, gastos fijos, merma) solo los cambia el dueño.</p>;

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="card max-w-2xl">
        <FieldsForm
          fields={FIELDS}
          initial={profile ?? undefined}
          onSubmit={(values) => {
            const margin = Number(values.margin_pct);
            if (!(margin >= 0 && margin < 95)) return Promise.resolve({ error: { message: "La ganancia sobre la venta va de 0% a 94%: con 100% no quedaría nada para pagar la pieza." } });
            return supabase().from("profiles").update(values).eq("id", profile!.id);
          }}
        />
      </div>
      <OverheadCosts />
      <WasteRules />
    </>
  );
}
