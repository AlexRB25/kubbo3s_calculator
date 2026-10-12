import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteStoreProduct, saveStoreProduct } from "@/app/actions";
import { ImagesInput } from "@/components/ImagesInput";
import { admin, must } from "@/lib/supabase/admin";

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string;
  price: number;
  compare_price: number | null;
  stock: number;
  images: string[];
  active: boolean;
  featured: boolean;
};

export default async function StoreProductFormPage({ params }: PageProps<"/tienda/[id]">) {
  const { id } = await params;
  const db = admin();
  const categories = must(await db.from("store_categories").select("id, name").order("sort").order("name")) as { id: string; name: string }[];
  const product = id === "nuevo" ? null : (must(await db.from("store_products").select("*").eq("id", id).maybeSingle()) as Product | null);
  if (id !== "nuevo" && !product) notFound();

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>{product?.name ?? "Nuevo producto"}</h1>
        <Link href="/tienda" className="btn">
          Volver
        </Link>
      </header>

      <form action={saveStoreProduct} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={product?.id ?? ""} />
        <label className="label sm:col-span-2">
          Nombre
          <input name="name" defaultValue={product?.name} className="input" required maxLength={120} />
        </label>
        <label className="label sm:col-span-2">
          Descripción
          <textarea name="description" defaultValue={product?.description} className="input" rows={6} />
        </label>
        <label className="label">
          Categoría
          <select name="category_id" defaultValue={product?.category_id ?? ""} className="input">
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Stock
          <input name="stock" type="number" min={0} step={1} defaultValue={product?.stock ?? 0} className="input" required />
        </label>
        <label className="label">
          Precio (MXN)
          <input name="price" type="number" min={0} step="0.01" defaultValue={product?.price} className="input" required />
        </label>
        <label className="label">
          Precio anterior (opcional)
          <input name="compare_price" type="number" min={0} step="0.01" defaultValue={product?.compare_price ?? ""} className="input" />
          <span className="font-normal">Se muestra tachado junto al precio.</span>
        </label>
        <div className="sm:col-span-2">
          <ImagesInput defaultValue={product?.images ?? []} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="active" type="checkbox" defaultChecked={product?.active ?? true} />
          Publicado en la tienda
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="featured" type="checkbox" defaultChecked={product?.featured ?? false} />
          Destacado (aparece primero y en la portada)
        </label>
        <div className="sm:col-span-2">
          <button className="btn btn-primary">Guardar</button>
        </div>
      </form>

      {product && (
        <form action={deleteStoreProduct}>
          <input type="hidden" name="id" value={product.id} />
          <button className="btn btn-danger">Eliminar producto</button>
          <span className="ml-3 text-xs text-muted">Los pedidos que ya lo incluyen conservan su nombre y precio.</span>
        </form>
      )}
    </>
  );
}
