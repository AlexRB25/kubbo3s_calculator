import { CURRENCIES, type Currency } from './currency';

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(currency: Currency, maxDigits?: number) {
  const key = `${currency}-${maxDigits ?? ''}`;
  let found = formatters.get(key);
  if (!found) {
    const { locale, digits } = CURRENCIES.find((item) => item.code === currency) ?? CURRENCIES[0];
    found = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: Math.max(digits, maxDigits ?? digits),
    });
    formatters.set(key, found);
  }
  return found;
}

/** The workshop's currency: costs and prices are typed and shown in it (set when its settings load). */
let workshopCurrency: Currency = 'MXN';
export const setWorkshopCurrency = (currency: Currency) => {
  workshopCurrency = currency;
};
export const getWorkshopCurrency = () => workshopCurrency;

/** An amount of the workshop, in its currency. */
export const money = (amount: number) => formatter(workshopCurrency).format(Number(amount) || 0);

/** An amount in a given currency; `maxDigits` allows more decimals (the cost of a gram). */
export const moneyIn = (amount: number, currency: Currency, maxDigits?: number) => formatter(currency, maxDigits).format(Number(amount) || 0);

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
