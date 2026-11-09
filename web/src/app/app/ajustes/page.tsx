"use client";

import { DeleteAccount } from "@/components/app/DeleteAccount";
import { CurrencySettings } from "@/components/app/CurrencySettings";
import { PriceLevelsSettings } from "@/components/app/PriceLevels";
import { NumberFormatSettings } from "@/components/app/NumberFormatSettings";
import { QuoteSettings } from "@/components/app/QuoteSettings";
import { ResellerSettings } from "@/components/app/ResellerSettings";
import { OverheadCosts } from "@/components/app/OverheadCosts";
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
];

export default function SettingsPage() {
  const { profile, shop } = useData();
  // Settings are the owner's: they set the costs and prices of the whole shop.
  if (shop && shop.role !== "owner") {
    return (
      <>
        <PageHeader title="Ajustes" />
        <p className="text-muted">Los ajustes de la tienda (luz, ganancia, gastos fijos, merma) solo los cambia el dueño.</p>
        <DeleteAccount />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ajustes" />
      <CurrencySettings />
      <NumberFormatSettings />
      {/* Keyed by currency: after converting, the forms start again from the converted amounts. */}
      <div className="card max-w-2xl">
        <FieldsForm
          key={profile?.currency}
          fields={FIELDS}
          initial={profile ?? undefined}
          onSubmit={(values) => supabase().from("profiles").update(values).eq("id", profile!.id)}
        />
      </div>
      <PriceLevelsSettings />
      <ResellerSettings key={`${profile?.reseller_pct}-${profile?.reseller_by_channel}`} />
      <OverheadCosts key={profile?.currency} />
      <WasteRules />
      <QuoteSettings />
      <DeleteAccount />
    </>
  );
}
