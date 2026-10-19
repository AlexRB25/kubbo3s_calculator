import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCatalogPrinter, saveCatalogPrinter } from "@/app/actions";
import { admin, must } from "@/lib/supabase/admin";
import type { CatalogPrinter } from "../page";

export default async function CatalogPrinterPage({ params }: PageProps<"/impresoras/[id]">) {
  const { id } = await params;
  const printer = id === "nuevo" ? null : (must(await admin().from("printer_catalog").select("*").eq("id", id).maybeSingle()) as CatalogPrinter | null);
  if (id !== "nuevo" && !printer) notFound();
  const brands = (must(await admin().from("printer_catalog").select("brand")) as { brand: string }[]).map((row) => row.brand);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>{printer ? `${printer.brand} ${printer.model}` : "Nuevo modelo de impresora"}</h1>
        <Link href="/impresoras" className="btn">
          Volver
        </Link>
      </header>

      <form action={saveCatalogPrinter} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={printer?.id ?? ""} />
        <label className="label">
          Marca
          <input name="brand" defaultValue={printer?.brand} className="input" required list="brands" placeholder="Bambu Lab, Creality, Prusa…" />
          <datalist id="brands">
            {[...new Set(brands)].map((brand) => (
              <option key={brand} value={brand} />
            ))}
          </datalist>
        </label>
        <label className="label">
          Modelo
          <input name="model" defaultValue={printer?.model} className="input" required placeholder="A1 mini, K1C, MK4S…" />
        </label>
        <label className="label">
          Consumo promedio (watts)
          <input name="power_watts" type="number" min={0} step="any" defaultValue={printer?.power_watts ?? 0} className="input" />
          <span className="font-normal">Se le sugiere al usuario; 0 si no se conoce.</span>
        </label>
        <label className="label">
          Orden dentro de la marca
          <input name="sort" type="number" step={1} defaultValue={printer?.sort ?? 0} className="input" />
        </label>
        <label className="label sm:col-span-2">
          Notas
          <textarea name="notes" defaultValue={printer?.notes} className="input" rows={3} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="active" type="checkbox" defaultChecked={printer?.active ?? true} />
          Visible para los usuarios
        </label>
        <div className="flex gap-3 sm:col-span-2">
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>

      {printer && (
        <form action={deleteCatalogPrinter} className="max-w-3xl">
          <input type="hidden" name="id" value={printer.id} />
          <button className="btn text-bad">Eliminar del catálogo</button>
          <p className="mt-1 text-xs text-muted">Las impresoras que ya lo usan se conservan; solo deja de aparecer para elegir.</p>
        </form>
      )}
    </>
  );
}
