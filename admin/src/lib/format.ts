const integer = new Intl.NumberFormat("es-MX");
const pesos = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export const money = (amount: number | string) => pesos.format(Number(amount));
export const count = (value: number | string) => integer.format(Number(value));
export const percent = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}%` : "—");

/** 12500 -> "12.5 kg" */
export const kilos = (grams: number | string) =>
  `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(Number(grams) / 1000)} kg`;

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** "2026-10-09" -> "9 oct" */
export const shortDay = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

/** "https://x.supabase.co//storage/…" -> "https://x.supabase.co/storage/…" (photos saved while PB_SUPABASE_URL ended in "/"). */
export const cleanUrl = (url: string) => url.replace(/([^:/])\/{2,}/g, "$1/");
