import { deleteProductCategory, saveProductCategory } from "@/app/actions";
import { admin, must } from "@/lib/supabase/admin";

type Category = { id: string; name: string; sort: number; active: boolean };

/** The 3D-printing categories users pick for their products; they can also type their own. */
export default async function CategoriesPage() {
  const categories = must(await admin().from("product_categories").select("*").order("sort").order("name")) as Category[];
  // How many products use each one (names, since a user may also type their own).
  const products = must(await admin().from("products").select("categories")) as { categories: string[] }[];
  const uses = new Map<string, number>();
  for (const product of products) for (const name of product.categories ?? []) uses.set(name, (uses.get(name) ?? 0) + 1);
  const typed = [...uses.entries()].filter(([name]) => !categories.some((category) => category.name === name)).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <header>
        <h1>Categorías de productos</h1>
        <p className="text-sm text-muted">Los usuarios eligen de aquí las categorías de sus productos (pueden ser varias) o escriben la suya.</p>
      </header>

      <form action={saveProductCategory} className="card flex max-w-3xl flex-wrap items-end gap-3">
        <label className="label min-w-48 flex-1">
          Nueva categoría
          <input name="name" className="input" required maxLength={60} placeholder="Portarretratos, Imanes…" />
        </label>
        <label className="label w-24">
          Orden
          <input name="sort" type="number" step={1} defaultValue={categories.length + 1} className="input" />
        </label>
        <input type="hidden" name="active" value="on" />
        <button className="btn btn-primary">Agregar</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Categoría</th>
              <th className="num">Orden</th>
              <th>Visible</th>
              <th className="num">Productos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td colSpan={3}>
                  <form action={saveProductCategory} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={category.id} />
                    <input name="name" defaultValue={category.name} className="input min-w-40 flex-1" required maxLength={60} />
                    <input name="sort" type="number" step={1} defaultValue={category.sort} className="input w-20" />
                    <label className="flex items-center gap-1 text-sm">
                      <input name="active" type="checkbox" defaultChecked={category.active} />
                      Visible
                    </label>
                    <button className="btn">Guardar</button>
                  </form>
                </td>
                <td className="num">{uses.get(category.name) ?? 0}</td>
                <td className="num">
                  <form action={deleteProductCategory}>
                    <input type="hidden" name="id" value={category.id} />
                    <button className="btn text-bad">Eliminar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {typed.length > 0 && (
        <section className="card flex flex-col gap-2">
          <h2>Escritas por los usuarios</h2>
          <p className="text-sm text-muted">No están en la lista; si alguna se repite, agrégala arriba para que todos la vean.</p>
          <ul className="flex flex-wrap gap-2">
            {typed.map(([name, count]) => (
              <li key={name} className="rounded-full border border-line px-3 py-1 text-sm">
                {name} <span className="text-muted">· {count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
