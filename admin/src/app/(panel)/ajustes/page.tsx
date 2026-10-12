import { saveStoreSettings } from "@/app/actions";
import { admin, must } from "@/lib/supabase/admin";

type Settings = {
  shipping_flat: number;
  free_shipping_from: number | null;
  payment_instructions: string;
  whatsapp: string;
  contact_email: string;
};

export default async function StoreSettingsPage() {
  const settings = must(await admin().from("store_settings").select("*").eq("id", 1).single()) as Settings;

  return (
    <>
      <h1>Ajustes de la tienda</h1>
      <form action={saveStoreSettings} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <label className="label">
          Costo de envío (MXN)
          <input name="shipping_flat" type="number" min={0} step="0.01" defaultValue={settings.shipping_flat} className="input" required />
          <span className="font-normal">Tarifa única por pedido.</span>
        </label>
        <label className="label">
          Envío gratis a partir de (MXN)
          <input name="free_shipping_from" type="number" min={0} step="0.01" defaultValue={settings.free_shipping_from ?? ""} className="input" />
          <span className="font-normal">Déjalo vacío para cobrar envío siempre.</span>
        </label>
        <label className="label sm:col-span-2">
          Instrucciones de pago
          <textarea
            name="payment_instructions"
            defaultValue={settings.payment_instructions}
            className="input"
            rows={5}
            placeholder={"Transferencia a:\nBanco, titular, CLABE…\nEnvía tu comprobante por WhatsApp con tu número de pedido."}
          />
          <span className="font-normal">El cliente las ve al terminar su pedido.</span>
        </label>
        <label className="label">
          WhatsApp de la tienda
          <input name="whatsapp" defaultValue={settings.whatsapp} className="input" placeholder="5215512345678" inputMode="numeric" />
          <span className="font-normal">Solo dígitos, con lada de país. Activa el botón para enviar el comprobante.</span>
        </label>
        <label className="label">
          Correo de contacto
          <input name="contact_email" type="email" defaultValue={settings.contact_email} className="input" />
        </label>
        <div className="sm:col-span-2">
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>
    </>
  );
}
