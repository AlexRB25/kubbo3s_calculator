import type { Currency } from "./currency";
import { supabase } from "./supabase";

// Equipment users sell to each other and technicians who offer their services (see supabase/schema.sql).
// Kubbo3D only shows them: buyers and clients talk to them by WhatsApp.

export const EQUIPMENT_CATEGORIES = [
  { value: "printer", label: "Impresoras 3D" },
  { value: "ams", label: "AMS y multicolor" },
  { value: "resin", label: "Resina y curado" },
  { value: "laser", label: "Láser y CNC" },
  { value: "scanner", label: "Escáneres 3D" },
  { value: "dryer", label: "Secadores de filamento" },
  { value: "parts", label: "Refacciones y mejoras" },
  { value: "other", label: "Otros" },
] as const;

export const CONDITIONS = [
  { value: "new", label: "Nuevo" },
  { value: "like_new", label: "Como nuevo" },
  { value: "used", label: "Usado" },
  { value: "for_parts", label: "Para reparar o piezas" },
] as const;

export const TECH_SERVICES = [
  { value: "repair", label: "Reparación" },
  { value: "maintenance", label: "Mantenimiento y revisión" },
  { value: "calibration", label: "Calibración" },
  { value: "install", label: "Instalación y armado" },
  { value: "upgrade", label: "Mejoras y modificaciones" },
  { value: "firmware", label: "Firmware y software" },
  { value: "training", label: "Capacitación" },
  { value: "parts", label: "Venta de refacciones" },
  { value: "resin", label: "Impresoras de resina" },
  { value: "laser", label: "Láser y CNC" },
] as const;

export const TECH_MODES = [
  { value: "workshop", label: "En su taller" },
  { value: "home", label: "A domicilio" },
  { value: "remote", label: "En línea" },
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number]["value"];
export type Condition = (typeof CONDITIONS)[number]["value"];
export type TechService = (typeof TECH_SERVICES)[number]["value"];
export type TechMode = (typeof TECH_MODES)[number]["value"];

export type Listing = {
  id: string;
  user_id: string;
  category: EquipmentCategory;
  title: string;
  brand: string;
  model: string;
  condition: Condition;
  price: number;
  currency: Currency;
  description: string;
  includes: string;
  images: string[];
  city: string;
  state: string;
  country: string;
  whatsapp: string;
  free_shipping: boolean;
  shipping_note: string;
  status: "active" | "paused" | "sold";
  blocked: boolean;
  created_at: string;
  updated_at: string;
};

export type TechProvider = {
  user_id: string;
  name: string;
  about: string;
  services: TechService[];
  brands: string[];
  modes: TechMode[];
  city: string;
  state: string;
  country: string;
  whatsapp: string;
  photo_path: string | null;
  active: boolean;
  blocked: boolean;
  rating_avg: number;
  rating_count: number;
  created_at: string;
};

export type TechReview = {
  id: string;
  provider_id: string;
  user_id: string;
  author_name: string;
  stars: number;
  comment: string;
  reply: string;
  created_at: string;
  updated_at: string;
};

export const labelOf = (list: readonly { value: string; label: string }[], value: string) => list.find((item) => item.value === value)?.label ?? value;

/** "Guadalajara, Jalisco · México" with the parts there are. */
export const placeOf = (item: { city: string; state: string; country: string }) =>
  [[item.city, item.state].filter(Boolean).join(", "), item.country].filter(Boolean).join(" · ");

/** Public URL of a photo in the `equipment` bucket. */
export function equipmentImage(path: string | null | undefined) {
  return path ? `${process.env.PB_SUPABASE_URL}/storage/v1/object/public/equipment/${path}` : null;
}

/** Uploads a photo to the user's folder of the `equipment` bucket; answers its path. */
export async function uploadEquipmentImage(userId: string, file: File) {
  if (file.size > 5 * 1024 * 1024) return { path: "", error: { message: `${file.name} pesa más de 5 MB.` } };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { path: "", error: { message: `${file.name} no es una foto JPG, PNG o WEBP.` } };
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const { error } = await supabase().storage.from("equipment").upload(path, file, { contentType: file.type });
  return { path, error };
}

/** The number as typed ("+52 1 55 1234 5678") with digits only, or "" when it cannot be a WhatsApp number. */
export function cleanWhatsapp(text: string) {
  const digits = text.replace(/\D/g, "");
  return /^[0-9]{10,15}$/.test(digits) ? digits : "";
}

/** A wa.me link that opens the chat with a first message already written. */
export const whatsappLink = (number: string, message: string) => `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

/** "+52 1 55 1234 5678"-ish for showing: the last 10 digits grouped, the rest as country code. */
export function showWhatsapp(number: string) {
  const local = number.slice(-10);
  const country = number.slice(0, -10);
  return `${country ? `+${country} ` : ""}${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
}

/** Star text for a rating: "★★★★☆". */
export const stars = (value: number) => "★★★★★".slice(0, Math.round(value)) + "☆☆☆☆☆".slice(0, 5 - Math.round(value));
