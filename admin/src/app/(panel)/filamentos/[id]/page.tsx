import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCatalogFilament, saveCatalogFilament } from "@/app/actions";
import { ColorsInput } from "@/components/ColorsInput";
import { ImagesInput } from "@/components/ImagesInput";
import { admin, must } from "@/lib/supabase/admin";
import type { CatalogFilament } from "../page";

const MATERIALS = ["PLA", "PLA Basic", "PLA+", "PLA Silk", "PLA Matte", "PETG", "Rapid PETG", "ABS", "ASA", "TPU", "Shoe3D", "PC", "Nylon", "PLA-CF", "PETG-CF"];

export default async function CatalogFilamentPage({ params }: PageProps<"/filamentos/[id]">) {
  const { id } = await params;
  const filament =
    id === "nuevo" ? null : (must(await admin().from("filament_catalog").select("*").eq("id", id).maybeSingle()) as CatalogFilament | null);
  if (id !== "nuevo" && !filament) notFound();

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>{filament ? `${filament.brand} · ${filament.color_name}` : "Nuevo filamento del catálogo"}</h1>
        <Link href="/filamentos" className="btn">
          Volver
        </Link>
      </header>

      <form action={saveCatalogFilament} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={filament?.id ?? ""} />
        <label className="label">
          Marca
          <input name="brand" defaultValue={filament?.brand} className="input" required placeholder="Elegoo, Bambu Lab, eSun…" />
        </label>
        <label className="label">
          Material
          <input name="material" defaultValue={filament?.material ?? "PLA"} className="input" required list="materials" />
          <datalist id="materials">
            {MATERIALS.map((material) => (
              <option key={material} value={material} />
            ))}
          </datalist>
        </label>
        <label className="label">
          Nombre del color
          <input name="color_name" defaultValue={filament?.color_name} className="input" required placeholder="Gris, Verde bosque, Rojo fuego…" />
        </label>
        <ColorsInput defaultColors={filament ? [filament.color_hex, ...(filament.extra_colors ?? [])] : []} defaultGlow={filament?.glow ?? false} />
        <label className="label">
          Peso del rollo (g)
          <input name="spool_g" type="number" min={1} step="any" defaultValue={filament?.spool_g ?? 1000} className="input" />
        </label>
        <label className="label">
          Precio de referencia por kg ($)
          <input name="reference_price_kg" type="number" min={0} step="any" defaultValue={filament?.reference_price_kg ?? 0} className="input" />
          <span className="font-normal">Lo que normalmente cuesta en México; el usuario lo puede cambiar.</span>
        </label>
        <label className="label">
          Temperatura de boquilla
          <input name="nozzle_temp" defaultValue={filament?.nozzle_temp} className="input" placeholder="190–220 °C" />
        </label>
        <label className="label">
          Temperatura de cama
          <input name="bed_temp" defaultValue={filament?.bed_temp} className="input" placeholder="50–60 °C" />
        </label>
        <label className="label sm:col-span-2">
          Notas
          <textarea name="notes" defaultValue={filament?.notes} className="input" rows={3} placeholder="Secado, velocidad, para qué sirve…" />
        </label>
        <div className="sm:col-span-2">
          <ImagesInput defaultValue={filament?.image_url ? [filament.image_url] : []} bucket="catalog" single />
        </div>
        <label className="label">
          Orden
          <input name="sort" type="number" step={1} defaultValue={filament?.sort ?? 0} className="input" />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input name="active" type="checkbox" defaultChecked={filament?.active ?? true} />
          Visible para los usuarios
        </label>
        <div className="flex gap-3 sm:col-span-2">
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>

      {filament && (
        <form action={deleteCatalogFilament} className="max-w-3xl">
          <input type="hidden" name="id" value={filament.id} />
          <button className="btn text-bad">Eliminar del catálogo</button>
          <p className="mt-1 text-xs text-muted">Los usuarios que ya lo usan conservan su filamento; solo deja de aparecer para elegir.</p>
        </form>
      )}
    </>
  );
}
