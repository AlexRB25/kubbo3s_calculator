"use client";

import { WasteRules } from "@/components/app/WasteRules";
import { FieldsForm, PageHeader, type FieldDef } from "@/components/app/ui";
import { useData } from "@/lib/data";
import { supabase } from "@/lib/supabase";

const FIELDS: FieldDef[] = [
  { name: "name", label: "Tu nombre" },
  { name: "business_name", label: "Nombre del negocio" },
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
  const { profile } = useData();

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
      <WasteRules />
    </>
  );
}
