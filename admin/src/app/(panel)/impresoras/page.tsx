import Link from "next/link";
import { admin, must } from "@/lib/supabase/admin";

export type CatalogPrinter = {
  id: string;
  brand: string;
  model: string;
  power_watts: number;
  notes: string;
  active: boolean;
  sort: number;
};

/** Printer brands and models Kubbo3D keeps up to date: users pick one when they add a printer. */
export default async function PrinterCatalogPage() {
  const printers = must(await admin().from("printer_catalog").select("*").order("brand").order("sort").order("model")) as CatalogPrinter[];
  // How many users registered each model.
  const used = must(await admin().from("printers").select("catalog_id").not("catalog_id", "is", null)) as { catalog_id: string }[];
  const uses = new Map<string, number>();
  for (const row of used) uses.set(row.catalog_id, (uses.get(row.catalog_id) ?? 0) + 1);
  const brands = [...new Set(printers.map((printer) => printer.brand))];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Catálogo de impresoras</h1>
          <p className="text-sm text-muted">Los usuarios eligen marca y modelo de aquí al dar de alta su impresora; si no está, escriben otro.</p>
        </div>
        <Link href="/impresoras/nuevo" className="btn btn-primary">
          Nuevo modelo
        </Link>
      </header>

      {printers.length === 0 ? (
        <p className="card text-muted">Todavía no hay impresoras en el catálogo.</p>
      ) : (
        brands.map((brand) => (
          <section key={brand} className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-4">{brand}</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th className="num">Consumo</th>
                  <th className="num">La usan</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {printers
                  .filter((printer) => printer.brand === brand)
                  .map((printer) => (
                    <tr key={printer.id}>
                      <td className="font-semibold">{printer.model}</td>
                      <td className="num">{printer.power_watts > 0 ? `${Math.round(printer.power_watts)} W` : "—"}</td>
                      <td className="num">{uses.get(printer.id) ?? 0}</td>
                      <td>{printer.active ? "Visible" : <span className="text-muted">Oculto</span>}</td>
                      <td className="num">
                        <Link href={`/impresoras/${printer.id}`} className="btn">
                          Editar
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </>
  );
}
