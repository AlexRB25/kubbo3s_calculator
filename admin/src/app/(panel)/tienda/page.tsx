import Image from "next/image";
import Link from "next/link";
import { deleteStoreCategory, saveStoreCategory } from "@/app/actions";
import { cleanUrl, count, money } from "@/lib/format";
import { admin, must } from "@/lib/supabase/admin";

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  price: number;
  stock: number;
  images: string[];
  active: boolean;
  featured: boolean;
};

type Category = { id: string; name: string; slug: string; sort: number };

export default async function StoreAdminPage() {
  const db = admin();
  const [products, categories] = await Promise.all([
    db.from("store_products").select("*").order("created_at", { ascending: false }).then(must) as Promise<Product[]>,
    db.from("store_categories").select("*").order("sort").order("name").then(must) as Promise<Category[]>,
  ]);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1>Tienda</h1>
        <Link href="/tienda/nuevo" className="btn btn-primary">
          Nuevo producto
        </Link>
      </header>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th className="num">Precio</th>
              <th className="num">Stock</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-raised">
                      {product.images[0] && <Image src={cleanUrl(product.images[0])} alt="" fill sizes="40px" className="object-cover" />}
                    </div>
                    {product.name}
                  </div>
                </td>
                <td className="text-muted">{categories.find((category) => category.id === product.category_id)?.name ?? "—"}</td>
                <td className="num">{money(product.price)}</td>
                <td className={`num ${product.stock <= 0 ? "text-bad" : ""}`}>{count(product.stock)}</td>
                <td>
                  <span className={product.active ? "text-money" : "text-muted"}>{product.active ? "Publicado" : "Oculto"}</span>
                  {product.featured && <span className="text-warn"> · Destacado</span>}
                </td>
                <td className="num">
                  <Link href={`/tienda/${product.id}`} className="btn">
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">
                  Todavía no hay productos. Crea el primero y márcalo como publicado para que aparezca en la tienda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Categorías</h2>
      <div className="card flex flex-col gap-3">
        {categories.map((category) => (
          <div key={category.id} className="flex flex-wrap items-end gap-2">
            <form action={saveStoreCategory} className="flex flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={category.id} />
              <label className="label min-w-40 flex-1">
                Nombre
                <input name="name" defaultValue={category.name} className="input" required />
              </label>
              <label className="label w-24">
                Orden
                <input name="sort" type="number" defaultValue={category.sort} className="input" />
              </label>
              <button className="btn">Guardar</button>
            </form>
            <form action={deleteStoreCategory}>
              <input type="hidden" name="id" value={category.id} />
              <button className="btn btn-danger">Eliminar</button>
            </form>
          </div>
        ))}
        <form action={saveStoreCategory} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <label className="label min-w-40 flex-1">
            Nueva categoría
            <input name="name" className="input" placeholder="Filamentos, Impresoras, Impresiones…" required />
          </label>
          <label className="label w-24">
            Orden
            <input name="sort" type="number" defaultValue={categories.length + 1} className="input" />
          </label>
          <button className="btn btn-primary">Agregar</button>
        </form>
      </div>
    </>
  );
}
