import Link from "next/link";
import { admin, must } from "@/lib/supabase/admin";

export type CatalogPackaging = {
  id: string;
  code: string;
  name: string;
  style: "rsc" | "mailer";
  material: "kraft" | "blanca" | "negra";
  length_mm: number;
  width_mm: number;
  height_mm: number;
  price_mxn: number | null;
  wholesale_price_mxn: number | null;
  wholesale_min: number | null;
  weight_g: number;
  notes: string;
  active: boolean;
  sort: number;
};

const cm = (mm: number) => `${Math.round(Number(mm)) / 10}`.replace(/\.0$/, "");
const pesos = (value: number | null) => (value === null ? "—" : `$${Number(value).toFixed(2)}`);

/** Boxes Kubbo3D keeps ready: users pick one and add it to their packaging. */
export default async function PackagingCatalogPage() {
  const boxes = must(await admin().from("packaging_catalog").select("*").order("sort").order("name")) as CatalogPackaging[];
  const used = must(await admin().from("packaging").select("catalog_id").not("catalog_id", "is", null)) as { catalog_id: string }[];
  const uses = new Map<string, number>();
  for (const row of used) uses.set(row.catalog_id, (uses.get(row.catalog_id) ?? 0) + 1);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Catálogo de empaques</h1>
          <p className="text-sm text-muted">Cajas con medidas y precios de referencia (MXN). Los usuarios las agregan a su embalaje y las ven en 3D.</p>
        </div>
        <Link href="/empaques/nuevo" className="btn btn-primary">
          Nueva caja
        </Link>
      </header>

      {boxes.length === 0 ? (
        <p className="card text-muted">Todavía no hay cajas. ¿Ya se ejecutó la última parte de supabase/schema.sql?</p>
      ) : (
        <section className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Caja</th>
                <th>Medidas (cm)</th>
                <th>Forma</th>
                <th className="num">Pieza</th>
                <th className="num">Mayoreo</th>
                <th className="num">La usan</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {boxes.map((box) => (
                <tr key={box.id}>
                  <td>
                    <span className="font-semibold">{box.name}</span>
                    <span className="block text-xs text-muted">{box.code}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    {cm(box.length_mm)} × {cm(box.width_mm)} × {cm(box.height_mm)}
                  </td>
                  <td className="text-muted">
                    {box.style === "mailer" ? "Con tapa" : "De envío"} · {box.material}
                  </td>
                  <td className="num">{pesos(box.price_mxn)}</td>
                  <td className="num">
                    {pesos(box.wholesale_price_mxn)}
                    {box.wholesale_min ? <span className="block text-xs text-muted">desde {box.wholesale_min}</span> : null}
                  </td>
                  <td className="num">{uses.get(box.id) ?? 0}</td>
                  <td>{box.active ? "Visible" : <span className="text-muted">Oculta</span>}</td>
                  <td className="num">
                    <Link href={`/empaques/${box.id}`} className="btn">
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
