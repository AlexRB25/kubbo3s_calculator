import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCatalogPackaging, saveCatalogPackaging } from "@/app/actions";
import { admin, must } from "@/lib/supabase/admin";
import type { CatalogPackaging } from "../page";

const cm = (mm: number | undefined) => (mm ? Math.round(Number(mm)) / 10 : "");

export default async function CatalogPackagingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const box = id === "nuevo" ? null : (must(await admin().from("packaging_catalog").select("*").eq("id", id).maybeSingle()) as CatalogPackaging | null);
  if (id !== "nuevo" && !box) notFound();

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>{box ? box.name : "Nueva caja del catálogo"}</h1>
        <Link href="/empaques" className="btn">
          Volver
        </Link>
      </header>

      <form action={saveCatalogPackaging} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={box?.id ?? ""} />
        <label className="label sm:col-span-2">
          Nombre
          <input name="name" defaultValue={box?.name} className="input" required placeholder="Caja corrugada 20×20×20" />
        </label>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <label className="label">
            Largo (cm)
            <input name="length" type="number" min={0.1} step="any" defaultValue={cm(box?.length_mm)} className="input" required />
          </label>
          <label className="label">
            Ancho (cm)
            <input name="width" type="number" min={0.1} step="any" defaultValue={cm(box?.width_mm)} className="input" required />
          </label>
          <label className="label">
            Alto (cm)
            <input name="height" type="number" min={0.1} step="any" defaultValue={cm(box?.height_mm)} className="input" required />
          </label>
        </div>
        <label className="label">
          Forma (para el 3D)
          <select name="style" defaultValue={box?.style ?? "rsc"} className="input">
            <option value="rsc">Caja de envío (4 solapas)</option>
            <option value="mailer">Con tapa (maletín, pizza)</option>
          </select>
        </label>
        <label className="label">
          Color
          <select name="material" defaultValue={box?.material ?? "kraft"} className="input">
            <option value="kraft">Kraft</option>
            <option value="blanca">Blanca</option>
            <option value="negra">Negra</option>
          </select>
        </label>
        <label className="label">
          Precio por pieza (MXN)
          <input name="price_mxn" type="number" min={0} step="any" defaultValue={box?.price_mxn ?? ""} className="input" />
          <span className="font-normal">Vacío si no se conoce.</span>
        </label>
        <label className="label">
          Precio de mayoreo (MXN)
          <input name="wholesale_price_mxn" type="number" min={0} step="any" defaultValue={box?.wholesale_price_mxn ?? ""} className="input" />
        </label>
        <label className="label">
          Mayoreo desde (piezas)
          <input name="wholesale_min" type="number" min={1} step={1} defaultValue={box?.wholesale_min ?? ""} className="input" />
        </label>
        <label className="label">
          Peso de la caja vacía (g)
          <input name="weight_g" type="number" min={0} step="any" defaultValue={box?.weight_g ?? 0} className="input" />
        </label>
        <label className="label">
          Código
          <input name="code" defaultValue={box?.code} className="input" placeholder="Se genera solo" />
        </label>
        <label className="label">
          Orden
          <input name="sort" type="number" step={1} defaultValue={box?.sort ?? 0} className="input" />
        </label>
        <label className="label sm:col-span-2">
          Notas (las ve el usuario)
          <textarea name="notes" defaultValue={box?.notes} className="input" rows={2} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="active" type="checkbox" defaultChecked={box?.active ?? true} />
          Visible para los usuarios
        </label>
        <div className="flex gap-3 sm:col-span-2">
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>

      {box && (
        <form action={deleteCatalogPackaging} className="max-w-3xl">
          <input type="hidden" name="id" value={box.id} />
          <button className="btn text-bad">Eliminar del catálogo</button>
          <p className="mt-1 text-xs text-muted">Los empaques que ya la usan se conservan; solo deja de aparecer para elegir.</p>
        </form>
      )}
    </>
  );
}
