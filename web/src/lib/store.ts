// Rows of the online store (see "Tienda en línea" in supabase/schema.sql).

export type StoreCategory = { id: string; name: string; slug: string; sort: number };

export type StoreProduct = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string;
  price: number;
  compare_price: number | null;
  stock: number;
  images: string[];
  featured: boolean;
};

export type StoreSettings = {
  shipping_flat: number;
  free_shipping_from: number | null;
  payment_instructions: string;
  whatsapp: string;
  contact_email: string;
};

/** What place_order() answers. */
export type PlacedOrder = { id: string; number: number; subtotal: number; shipping: number; total: number };

export function shippingFor(subtotal: number, settings: StoreSettings | null) {
  if (!settings) return 0;
  return settings.free_shipping_from != null && subtotal >= settings.free_shipping_from ? 0 : settings.shipping_flat;
}
