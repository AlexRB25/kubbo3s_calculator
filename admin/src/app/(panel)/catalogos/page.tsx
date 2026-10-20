import { setCatalogDomain } from "@/app/actions";
import { admin, must } from "@/lib/supabase/admin";

type Catalog = {
  user_id: string;
  slug: string;
  title: string;
  published: boolean;
  domain: string | null;
  domain_verified: boolean;
  updated_at: string;
};

/**
 * Users' public catalogs. Their own domains wait here: add the domain to the hosting project, check
 * its CNAME, then mark it connected; until then the catalog only opens at /c/<address>.
 */
export default async function CatalogsPage({ searchParams }: PageProps<"/catalogos">) {
  const params = await searchParams;
  const catalogs = must(await admin().from("catalogs").select("user_id, slug, title, published, domain, domain_verified, updated_at").order("updated_at", { ascending: false })) as Catalog[];
  const users = must(await admin().from("admin_users").select("id, email")) as { id: string; email: string }[];
  const email = new Map(users.map((user) => [user.id, user.email]));
  const pending = catalogs.filter((catalog) => catalog.domain && !catalog.domain_verified);
  const site = (process.env.WEB_URL ?? "").replace(/\/$/, "");

  return (
    <>
      <header>
        <h1>Catálogos y dominios</h1>
        <p className="text-sm text-muted">
          Los catálogos públicos de los usuarios. Un dominio propio solo responde cuando lo marcas conectado: antes agrégalo al proyecto web en el hosting y
          revisa que su CNAME apunte ahí.
        </p>
      </header>
      {typeof params.error === "string" && (
        <p role="alert" className="error">
          {params.error}
        </p>
      )}
      {pending.length > 0 && <p className="text-sm text-warn">{pending.length} dominio(s) esperando conexión.</p>}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Catálogo</th>
              <th>Usuario</th>
              <th>Publicado</th>
              <th>Dominio propio</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {catalogs.map((catalog) => (
              <tr key={catalog.user_id}>
                <td>
                  {site ? (
                    <a href={`${site}/c/${catalog.slug}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand">
                      {catalog.title || catalog.slug}
                    </a>
                  ) : (
                    catalog.title || catalog.slug
                  )}
                  <div className="text-xs text-muted">/c/{catalog.slug}</div>
                </td>
                <td className="text-sm">{email.get(catalog.user_id) ?? "—"}</td>
                <td>{catalog.published ? "Sí" : <span className="text-muted">No</span>}</td>
                <td>
                  {catalog.domain ? (
                    <>
                      {catalog.domain}
                      <div className={`text-xs ${catalog.domain_verified ? "text-money" : "text-warn"}`}>{catalog.domain_verified ? "Conectado" : "Pendiente"}</div>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="num">
                  {catalog.domain && (
                    <form action={setCatalogDomain}>
                      <input type="hidden" name="user_id" value={catalog.user_id} />
                      {!catalog.domain_verified && <input type="hidden" name="verified" value="on" />}
                      <button className={`btn ${catalog.domain_verified ? "text-bad" : "btn-primary"}`}>{catalog.domain_verified ? "Desconectar" : "Marcar conectado"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {catalogs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted">
                  Nadie ha creado su catálogo todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
