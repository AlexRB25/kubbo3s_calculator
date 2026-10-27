// Rows and helpers of the 3D model marketplace (see "Marketplace de modelos 3D" in supabase/schema.sql).

export type ModelFile = { path: string; name: string; size: number };

export type Maker = { user_id: string; handle: string; name: string; bio: string; country: string; created_at: string };

export type Model = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  commercial: boolean;
  print_notes: string;
  images: string[];
  files: ModelFile[];
  status: "draft" | "published";
  blocked: boolean;
  blocked_reason: string;
  downloads: number;
  sales: number;
  likes: number;
  comments: number;
  rating_avg: number;
  rating_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A model as listed, with its author. */
export type ModelCard = Pick<Model, "id" | "title" | "price" | "images" | "downloads" | "likes" | "rating_avg" | "rating_count"> & {
  makers: Pick<Maker, "handle" | "name"> | null;
};
export const CARD_COLUMNS = "id, title, price, images, downloads, likes, rating_avg, rating_count, makers(handle, name)";

export type Comment = {
  id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  makers: Pick<Maker, "handle" | "name"> | null;
};

export type Balance = {
  earned: number;
  held: number;
  withdrawn: number;
  requested: number;
  available: number;
  min_payout: number;
  hold_days: number;
  fee_pct: number;
};

export type PayoutMethod = "clabe" | "mercadopago" | "paypal";

export const PAYOUT_METHODS: { value: PayoutMethod; label: string; hint: string; placeholder: string }[] = [
  { value: "clabe", label: "Transferencia (CLABE)", hint: "Cuentas de banco en México: 18 dígitos.", placeholder: "012345678901234567" },
  { value: "mercadopago", label: "Mercado Pago", hint: "El correo de tu cuenta de Mercado Pago (México).", placeholder: "tu@correo.com" },
  { value: "paypal", label: "PayPal", hint: "Desde cualquier país: el correo de tu cuenta de PayPal.", placeholder: "tu@correo.com" },
];

export const CATEGORIES: { value: string; label: string }[] = [
  { value: "figuras", label: "Figuras y personajes" },
  { value: "hogar", label: "Hogar y decoración" },
  { value: "macetas", label: "Macetas y jardín" },
  { value: "juguetes", label: "Juguetes y juegos" },
  { value: "miniaturas", label: "Miniaturas y rol" },
  { value: "cosplay", label: "Cosplay y disfraces" },
  { value: "gadgets", label: "Gadgets y soportes" },
  { value: "herramientas", label: "Herramientas" },
  { value: "repuestos", label: "Repuestos y refacciones" },
  { value: "impresora", label: "Mejoras para la impresora" },
  { value: "moda", label: "Moda y accesorios" },
  { value: "arte", label: "Arte y esculturas" },
  { value: "educacion", label: "Educación" },
  { value: "mascotas", label: "Mascotas" },
  { value: "otros", label: "Otros" },
];
export const categoryLabel = (value: string) => CATEGORIES.find((item) => item.value === value)?.label ?? "Otros";

export const SORTS = [
  { value: "recientes", label: "Recientes" },
  { value: "populares", label: "Más descargados" },
  { value: "calificados", label: "Mejor calificados" },
  { value: "favoritos", label: "Más guardados" },
] as const;

export const REPORT_REASONS = [
  { value: "copyright", label: "No es de quien lo vende (derechos de autor)" },
  { value: "offensive", label: "Contenido ofensivo o ilegal" },
  { value: "broken", label: "Los archivos no sirven o no son lo que muestra" },
  { value: "other", label: "Otro" },
] as const;

/** Only these go to the private bucket; anything else is refused before uploading. */
export const MODEL_EXTENSIONS = [".stl", ".3mf", ".obj", ".step", ".stp", ".zip"];
export const MAX_FILE_MB = 100;
export const MAX_IMAGE_MB = 8;

const url = process.env.PB_SUPABASE_URL;

/** Public URL of a model photo (bucket `model-media`). */
export const mediaUrl = (path: string) => `${url}/storage/v1/object/public/model-media/${path}`;

export const makerName = (maker: Pick<Maker, "handle" | "name"> | null) => maker?.name || (maker ? `@${maker.handle}` : "Anónimo");

/** 1536000 -> "1.5 MB" */
export function fileSize(bytes: number) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "Groot maceta v2.STL" -> "Groot-maceta-v2.stl": a storage key without spaces, accents or slashes. */
export function safeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "archivo"}${dot > 0 ? name.slice(dot).toLowerCase() : ""}`;
}
