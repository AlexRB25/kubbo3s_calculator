// Currencies a workshop can work in, and today's rates to convert what Kubbo3D recommends (in Mexican
// pesos) and the prices of the store and the marketplace (charged in Mexican pesos).

export type Currency = 'MXN' | 'USD' | 'COP';

export const CURRENCIES: { code: Currency; label: string; locale: string; digits: number }[] = [
  { code: 'MXN', label: 'Peso mexicano (MXN)', locale: 'es-MX', digits: 2 },
  { code: 'USD', label: 'Dólar estadounidense (USD)', locale: 'en-US', digits: 2 },
  { code: 'COP', label: 'Peso colombiano (COP)', locale: 'es-CO', digits: 0 },
];

export const isCurrency = (value: unknown): value is Currency => CURRENCIES.some((item) => item.code === value);

/** What one Mexican peso is worth; approximate, only while today's rates cannot be read. */
const FALLBACK_RATES: Record<Currency, number> = { MXN: 1, USD: 0.053, COP: 170 };

let rates = FALLBACK_RATES;
let loading: Promise<Record<Currency, number>> | null = null;

/** Today's rates from Mexican pesos (open.er-api.com, updated daily); read once per session. */
export function loadRates() {
  loading ??= fetch('https://open.er-api.com/v6/latest/MXN')
    .then((response) => response.json())
    .then((body: { result?: string; rates?: Record<string, number> }) => {
      if (body.result === 'success' && body.rates?.USD && body.rates?.COP) rates = { MXN: 1, USD: body.rates.USD, COP: body.rates.COP };
      return rates;
    })
    .catch(() => rates);
  return loading;
}

/** Mexican pesos in another currency, rounded the way a price in it is written. */
export function fromMxn(amount: number, currency: Currency, current = rates) {
  const value = (Number(amount) || 0) * current[currency];
  if (currency === 'COP') return Math.round(value / 100) * 100;
  return Math.round(value * 100) / 100;
}
