import { cache } from "react";
import type { Currency } from "@/lib/currency";
import { publicClient, supabaseConfigured } from "@/lib/supabase";

// A workshop's public catalog (see "Catálogo público del taller" in supabase/schema.sql).

/** A product's listing in one of the seller's channels. `price` is null when prices are hidden. */
export type CatalogLink = { channel: string; url: string; price: number | null };

export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  image_path: string | null;
  image_paths: string[];
  categories: string[];
  links: CatalogLink[];
};

/** What public_catalog() answers: never costs, plates or stock. */
export type PublicCatalog = {
  slug: string;
  title: string;
  about: string;
  whatsapp: string;
  show_prices: boolean;
  /** The workshop's currency: its prices are written in it. */
  currency?: Currency;
  domain: string | null;
  products: CatalogProduct[];
};

/** The catalog's address: lowercase letters, numbers and dashes. */
export const SLUG = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

/** Request header the proxy sets when the catalog is served at the root of its own domain. */
export const ROOT_HEADER = "x-catalog-root";

/** One query per request, shared by generateMetadata and the page. `key` is the slug or a verified domain. */
export const loadCatalog = cache(async (key: string): Promise<PublicCatalog | null> => {
  if (!supabaseConfigured) return null;
  const { data, error } = await publicClient().rpc("public_catalog", { p_key: decodeURIComponent(key).toLowerCase() });
  if (error) throw new Error(error.message);
  return data;
});

/** The lowest price among its channels, or null when there is none to show. */
export function lowestPrice(product: CatalogProduct) {
  const prices = product.links.flatMap((link) => (link.price != null && link.price > 0 ? [Number(link.price)] : []));
  return prices.length ? Math.min(...prices) : null;
}

export function whatsappUrl(number: string, text: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Categories used by the products, most used first. */
export function catalogCategories(products: CatalogProduct[]) {
  const count = new Map<string, number>();
  for (const product of products) for (const name of product.categories) count.set(name, (count.get(name) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([name]) => name);
}
