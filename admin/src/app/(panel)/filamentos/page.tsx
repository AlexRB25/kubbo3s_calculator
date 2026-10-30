import Image from "next/image";
import Link from "next/link";
import { Swatch } from "@/components/Swatch";
import { cleanUrl, money } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

export type CatalogFilament = {
  id: string;
  brand: string;
  material: string;
  color_name: string;
  color_hex: string;
  /** The other colours of a bicolor, tricolor or rainbow filament, after color_hex. */
  extra_colors: string[];
  /** Glow in the dark. */
  glow: boolean;
  image_url: string | null;
  spool_g: number;
  reference_price_kg: number;
  nozzle_temp: string;
  bed_temp: string;
  notes: string;
  active: boolean;
  sort: number;
};

const colorsOf = (filament: CatalogFilament) => [filament.color_hex, ...(filament.extra_colors ?? [])];

/** Filaments Kubbo3D preloads: users pick one when they add a filament and only fill in their own data. */
export default async function FilamentCatalogPage() {
  const filaments = must(
    await admin().from("filament_catalog").select("*").order("brand").order("material").order("sort").order("color_name"),
  ) as CatalogFilament[];
  // How many users added each one to their workshop.
  const used = must(await admin().from("filaments").select("catalog_id").not("catalog_id", "is", null)) as { catalog_id: string }[];
  const uses = new Map<string, number>();
  for (const row of used) uses.set(row.catalog_id, (uses.get(row.catalog_id) ?? 0) + 1);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Catálogo de filamentos</h1>
          <p className="text-sm text-muted">Los usuarios eligen de aquí al dar de alta un filamento y solo completan su costo, proveedor y existencia.</p>
        </div>
        <Link href="/filamentos/nuevo" className="btn btn-primary">
          Nuevo filamento
        </Link>
      </header>

      {filaments.length === 0 ? (
        <p className="card text-muted">Todavía no hay filamentos en el catálogo.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Filamento</th>
                <th>Material</th>
                <th className="num">Rollo</th>
                <th className="num">Referencia por kg</th>
                <th className="num">Lo usan</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filaments.map((filament) => (
                <tr key={filament.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Swatch colors={colorsOf(filament)} glow={filament.glow} className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-line">
                        {filament.image_url && <Image src={cleanUrl(filament.image_url)} alt="" fill sizes="48px" className="object-cover" />}
                      </Swatch>
                      <div>
                        <p className="font-semibold">
                          {filament.brand} · {filament.color_name || "Sin nombre de color"}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-muted">
                          <Swatch colors={colorsOf(filament)} glow={filament.glow} className="inline-block size-3 shrink-0 rounded-full border border-line" />
                          {colorsOf(filament).join(" · ")}
                          {filament.glow && " · fosforescente"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>{filament.material}</td>
                  <td className="num">{Math.round(filament.spool_g)} g</td>
                  <td className="num">{filament.reference_price_kg > 0 ? money(filament.reference_price_kg) : "—"}</td>
                  <td className="num">{uses.get(filament.id) ?? 0}</td>
                  <td>{filament.active ? "Visible" : <span className="text-muted">Oculto</span>}</td>
                  <td className="num">
                    <Link href={`/filamentos/${filament.id}`} className="btn">
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
