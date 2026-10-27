import { NextResponse, type NextRequest } from "next/server";
// Same as ROOT_HEADER in lib/catalog (not imported, to keep the proxy free of the Supabase client).
const ROOT_HEADER = "x-catalog-root";

// Serves sellers' catalogs on hosts that are not this site:
//   - <slug>.<PB_CATALOG_DOMAIN> (e.g. mitaller.kubbo3d.shop) → /c/<slug>
//   - a seller's own domain (tienda.midominio.com), once it is connected → /c/<domain>
// Requests to this site's own hosts pass through untouched.

const hostOf = (value: string | undefined) => {
  try {
    return value ? new URL(value).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
};

/** Kubbo3D's own domain: it and every subdomain (calculator., tools., www.) are always this site's. */
const KUBBO_DOMAIN = "kubbo3d.com";

/** Hosts that are this site. Without SITE_URL or PB_COOKIE_DOMAIN own domains are not served (nothing to tell them apart). */
function isOwnHost(host: string) {
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app")) return true;
  if (host === KUBBO_DOMAIN || host.endsWith(`.${KUBBO_DOMAIN}`)) return true;
  if (host === hostOf(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ""}`)) return true;
  const site = hostOf(process.env.SITE_URL).replace(/^www\./, "");
  const parent = (process.env.PB_COOKIE_DOMAIN ?? "").replace(/^\./, "").toLowerCase();
  if (!site && !parent) return true;
  return host === site || (parent !== "" && (host === parent || host.endsWith(`.${parent}`)));
}

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase().replace(/^www\./, "");
  const catalogDomain = (process.env.PB_CATALOG_DOMAIN ?? "").toLowerCase();
  let key = "";
  if (catalogDomain && host.endsWith(`.${catalogDomain}`)) key = host.slice(0, -(catalogDomain.length + 1));
  else if (host && host !== catalogDomain && !isOwnHost(host)) key = host;
  if (!key) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/c/${key}${url.pathname === "/" ? "" : url.pathname}`;
  const headers = new Headers(request.headers);
  headers.set(ROOT_HEADER, "1");
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Pages only: not Next.js assets, API routes or files with an extension.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
