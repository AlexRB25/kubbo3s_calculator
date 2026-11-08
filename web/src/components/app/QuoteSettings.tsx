"use client";

import { useState } from "react";
import { FieldsForm, type FieldDef } from "@/components/app/ui";
import { useData, useSave } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type { QuoteSettings as Settings } from "@/lib/types";

const FIELDS: FieldDef[] = [
  { name: "phone", label: "Teléfono o WhatsApp" },
  { name: "email", label: "Correo de contacto" },
  { name: "address", label: "Dirección", wide: true, placeholder: "Calle, colonia, ciudad" },
  { name: "tax_pct", label: "Impuesto que se suma (%)", type: "number", hint: "16 para IVA en México; 0 si no facturas." },
  { name: "validity_days", label: "Vigencia de la cotización (días)", type: "number" },
  { name: "payment_terms", label: "Condiciones de pago", type: "textarea", placeholder: "50 % de anticipo y el resto al entregar" },
  { name: "delivery", label: "Entrega", type: "textarea", placeholder: "5 días hábiles después del anticipo" },
  { name: "notes", label: "Notas", type: "textarea", placeholder: "Los precios pueden cambiar si cambian las medidas, el material o los colores." },
];

/** Public address of a file in the products bucket. */
export const publicFile = (path?: string | null) => (path ? supabase().storage.from("products").getPublicUrl(path).data.publicUrl : null);

/** The workshop's details on its quotes (contact, logo) and what each new quote proposes. */
export function QuoteSettings() {
  const { profile, shop } = useData();
  const { busy, error, save } = useSave();
  const [uploading, setUploading] = useState(false);
  const settings: Settings = profile?.quote_settings ?? {};
  const logo = publicFile(settings.logo_path);

  const write = (next: Settings) => supabase().from("profiles").update({ quote_settings: next }).eq("id", profile!.id);

  async function upload(file: File) {
    if (!profile || !shop) return;
    if (file.size > 2 * 1024 * 1024) return window.alert("El logo debe pesar menos de 2 MB.");
    setUploading(true);
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${shop.shop_id}/logo-${Date.now()}.${extension}`;
    const uploaded = await supabase().storage.from("products").upload(path, file, { contentType: file.type || "image/png" });
    setUploading(false);
    if (uploaded.error) return window.alert(`No se pudo subir el logo: ${uploaded.error.message}`);
    const old = settings.logo_path;
    save(() => write({ ...settings, logo_path: path }), () => {
      if (old) supabase().storage.from("products").remove([old]);
    });
  }

  if (profile && profile.quote_settings === undefined) {
    return (
      <div className="card max-w-2xl">
        <h2>Cotizaciones</h2>
        <p className="text-sm text-muted">Para guardar los datos de tus cotizaciones falta actualizar la base de datos (supabase/schema.sql).</p>
      </div>
    );
  }

  return (
    <div className="card flex max-w-2xl flex-col gap-4">
      <div>
        <h2>Cotizaciones</h2>
        <p className="text-sm text-muted">Estos datos salen en el PDF que mandas a tus clientes. El nombre del negocio se toma de arriba.</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-raised">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the user's logo from storage
            <img src={logo} alt="Logo del negocio" className="size-full object-contain" />
          ) : (
            <span className="text-xs text-muted">Sin logo</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="btn cursor-pointer">
            {uploading ? "Subiendo…" : logo ? "Cambiar logo" : "Subir logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploading || busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) upload(file);
              }}
            />
          </label>
          {logo && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                const old = settings.logo_path;
                save(() => write({ ...settings, logo_path: "" }), () => old && supabase().storage.from("products").remove([old]));
              }}
            >
              Quitar
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <FieldsForm
        fields={FIELDS}
        initial={{ tax_pct: 16, validity_days: 15, ...settings }}
        onSubmit={(values) => write({ ...settings, ...values } as Settings)}
      />
    </div>
  );
}
