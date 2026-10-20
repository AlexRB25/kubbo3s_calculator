import { headers } from "next/headers";
import { ROOT_HEADER } from "@/lib/catalog";

/** Where a catalog lives: /c/<slug> on this site, or the root of the seller's own domain. Server only. */
export async function catalogBase(slug: string) {
  return (await headers()).get(ROOT_HEADER) ? "" : `/c/${slug}`;
}
