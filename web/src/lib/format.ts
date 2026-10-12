const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export const money = (amount: number) => pesos.format(Number(amount) || 0);

/** 1250 -> "1.25 kg", 250 -> "250 g" */
export function weight(grams: number) {
  const value = Number(grams) || 0;
  return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(2)} kg` : `${Math.round(value * 10) / 10} g`;
}

/** 150 -> "2 h 30 min" */
export function duration(minutes: number) {
  const total = Math.round(Number(minutes) || 0);
  if (total < 60) return `${total} min`;
  const rest = total % 60;
  return rest ? `${Math.floor(total / 60)} h ${rest} min` : `${Math.floor(total / 60)} h`;
}

/** Accepts a timestamp or a plain "2026-10-09" date and prints "9 oct 2026". */
export function day(iso: string) {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A Date as "2026-10-09" in the phone's time zone. */
export function isoDay(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isIsoDay(text: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text));
}

/** Text typed in a numeric field -> number. Accepts a decimal comma; anything invalid is 0. */
export function num(text: string) {
  const value = Number(text.replace(',', '.').trim());
  return Number.isFinite(value) ? value : 0;
}

/** Number -> text for a field; zero shows as empty so the placeholder is visible. */
export const field = (value: number | null | undefined) => (value ? String(value) : '');
