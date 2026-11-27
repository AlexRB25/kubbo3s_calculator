import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eliminar tu cuenta de Kubbo3D",
  description: "Cómo eliminar tu cuenta de Kubbo3D y todos tus datos, desde la app, la web o por correo.",
};

const SUPPORT = "soporte@kubbo3d.com";

/** Public page the stores ask for: how to delete the account and its data, also without the app. */
export default function DeleteAccountInfoPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Eliminar tu cuenta de Kubbo3D</h1>
        <p className="text-muted">
          Kubbo3D (app Kubbo3D, calculadora web y herramientas 3D) usa una sola cuenta. Puedes eliminarla con todos tus datos cuando quieras.
        </p>
      </header>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Cómo eliminarla</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>En la app:</strong> entra a tu cuenta, ve a <strong>Más → Eliminar mi cuenta</strong>, escribe <strong>ELIMINAR</strong> y confirma.
          </li>
          <li>
            <strong>En la web:</strong> entra en{" "}
            <Link href="/app/ajustes" className="text-accent underline">
              calculator.kubbo3d.com/app/ajustes
            </Link>
            , baja a <strong>Eliminar mi cuenta</strong>, escribe <strong>ELIMINAR</strong> y confirma.
          </li>
          <li>
            <strong>Sin la app:</strong> escríbenos a{" "}
            <a href={`mailto:${SUPPORT}?subject=Eliminar%20mi%20cuenta`} className="text-accent underline">
              {SUPPORT}
            </a>{" "}
            desde el correo de tu cuenta, con el asunto «Eliminar mi cuenta». La eliminamos en menos de 30 días y te avisamos al terminar.
          </li>
        </ol>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Qué se borra</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tu cuenta: nombre, correo y contraseña.</li>
          <li>Tu taller: productos, impresoras, filamento y resina, inventario, impresiones, ventas, gastos, cotizaciones, clientes y proveedores.</li>
          <li>Tus archivos e imágenes (modelos, fotos, archivos laminados y escaneos) y tu tienda o catálogo.</li>
          <li>Tu suscripción se cancela en ese momento y no se te vuelve a cobrar.</li>
        </ul>
        <p>Desde la app y la web se borra al momento y no se puede deshacer.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Qué se conserva</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Los comprobantes de pago que guarda nuestro procesador de pagos (Stripe), durante el tiempo que exija la ley fiscal.
          </li>
          <li>
            Si vendiste modelos en el marketplace, quienes los compraron conservan su copia; en ese caso la cuenta se cierra por correo con {SUPPORT}.
          </li>
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Borrar solo algunos datos</h2>
        <p>
          Sin eliminar la cuenta, puedes borrar cualquier producto, venta, cliente, archivo u otro registro desde la app o la web. Si prefieres que lo hagamos
          nosotros, escríbenos a{" "}
          <a href={`mailto:${SUPPORT}`} className="text-accent underline">
            {SUPPORT}
          </a>{" "}
          diciendo qué datos quieres borrar.
        </p>
      </section>

      <p className="text-sm text-muted">
        Más detalles en el{" "}
        <a href={`${process.env.PB_LANDING_URL}/privacidad`} className="underline">
          aviso de privacidad
        </a>
        .
      </p>
    </main>
  );
}
