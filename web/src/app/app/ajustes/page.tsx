"use client";

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
    label: "Ganancia deseada sobre el costo (%)",
    type: "number",
    hint: "Con 100%, el precio sugerido te deja de ganancia lo mismo que costó producir la pieza, ya pagadas comisión y envío.",
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
          onSubmit={(values) => supabase().from("profiles").update(values).eq("id", profile!.id)}
        />
      </div>
    </>
  );
}
