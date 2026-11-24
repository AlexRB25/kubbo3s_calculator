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

/** The legal pages live on the landing; every settings view links them. */
function LegalLinks() {
  const base = process.env.PB_LANDING_URL;
  return (
    <p className="mt-6 flex flex-wrap gap-4 text-sm text-muted">
      <a href={`${base}/terminos`} target="_blank" rel="noreferrer" className="underline hover:text-fg">
        Términos y condiciones
      </a>
      <a href={`${base}/privacidad`} target="_blank" rel="noreferrer" className="underline hover:text-fg">
        Aviso de privacidad
      </a>
    </p>
  );
}

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
        <LegalLinks />
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
      <LegalLinks />
    </>
  );
}
