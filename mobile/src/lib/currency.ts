// Currencies a workshop can work in, and today's rates to convert what Kubbo3D recommends (in Mexican
// pesos) and the prices of the store and the marketplace (charged in Mexican pesos).

const LIST = [
  { code: 'MXN', label: 'Peso mexicano (MXN)', locale: 'es-MX', digits: 2, perMxn: 1 },
  { code: 'USD', label: 'Dólar estadounidense (USD)', locale: 'en-US', digits: 2, perMxn: 0.053 },
  { code: 'COP', label: 'Peso colombiano (COP)', locale: 'es-CO', digits: 0, perMxn: 170 },
  { code: 'ARS', label: 'Peso argentino (ARS)', locale: 'es-AR', digits: 2, perMxn: 82 },
  { code: 'PEN', label: 'Sol peruano (PEN)', locale: 'es-PE', digits: 2, perMxn: 0.18 },
  { code: 'CLP', label: 'Peso chileno (CLP)', locale: 'es-CL', digits: 0, perMxn: 53 },
  { code: 'BRL', label: 'Real brasileño (BRL)', locale: 'pt-BR', digits: 2, perMxn: 0.29 },
  { code: 'UYU', label: 'Peso uruguayo (UYU)', locale: 'es-UY', digits: 2, perMxn: 2.1 },
  { code: 'PYG', label: 'Guaraní paraguayo (PYG)', locale: 'es-PY', digits: 0, perMxn: 310 },
  { code: 'BOB', label: 'Boliviano (BOB)', locale: 'es-BO', digits: 2, perMxn: 0.64 },
  { code: 'VES', label: 'Bolívar venezolano (VES)', locale: 'es-VE', digits: 2, perMxn: 47 },
  { code: 'GTQ', label: 'Quetzal guatemalteco (GTQ)', locale: 'es-GT', digits: 2, perMxn: 0.41 },
  { code: 'HNL', label: 'Lempira hondureño (HNL)', locale: 'es-HN', digits: 2, perMxn: 1.4 },
  { code: 'NIO', label: 'Córdoba nicaragüense (NIO)', locale: 'es-NI', digits: 2, perMxn: 2 },
  { code: 'CRC', label: 'Colón costarricense (CRC)', locale: 'es-CR', digits: 0, perMxn: 24 },
  { code: 'PAB', label: 'Balboa panameño (PAB)', locale: 'es-PA', digits: 2, perMxn: 0.053 },
  { code: 'DOP', label: 'Peso dominicano (DOP)', locale: 'es-DO', digits: 2, perMxn: 3.2 },
  { code: 'CAD', label: 'Dólar canadiense (CAD)', locale: 'en-CA', digits: 2, perMxn: 0.074 },
  { code: 'EUR', label: 'Euro (EUR)', locale: 'es-ES', digits: 2, perMxn: 0.048 },
  { code: 'GBP', label: 'Libra esterlina (GBP)', locale: 'en-GB', digits: 2, perMxn: 0.04 },
] as const;

export type Currency = (typeof LIST)[number]['code'];

export const CURRENCIES: { code: Currency; label: string; locale: string; digits: number }[] = LIST.map(({ code, label, locale, digits }) => ({
  code,
  label,
  locale,
  digits,
}));

export const isCurrency = (value: unknown): value is Currency => CURRENCIES.some((item) => item.code === value);

/** What one Mexican peso is worth; approximate, only while today's rates cannot be read. */
const FALLBACK_RATES = Object.fromEntries(LIST.map((item) => [item.code, item.perMxn])) as Record<Currency, number>;

let rates = FALLBACK_RATES;
let loading: Promise<Record<Currency, number>> | null = null;

/** Today's rates from Mexican pesos (open.er-api.com, updated daily); read once per session. */
export function loadRates() {
  loading ??= fetch('https://open.er-api.com/v6/latest/MXN')
    .then((response) => response.json())
    .then((body: { result?: string; rates?: Record<string, number> }) => {
      if (body.result === 'success' && body.rates) {
        rates = Object.fromEntries(LIST.map((item) => [item.code, body.rates![item.code] || item.perMxn])) as Record<Currency, number>;
        rates.MXN = 1;
      }
      return rates;
    })
    .catch(() => rates);
  return loading;
}

/** Mexican pesos in another currency, rounded the way a price in it is written. */
export function fromMxn(amount: number, currency: Currency, current = rates) {
  const value = (Number(amount) || 0) * current[currency];
  // Currencies without cents (Colombian or Chilean pesos…) are written in whole units.
  return CURRENCIES.find((item) => item.code === currency)?.digits === 0 ? Math.round(value) : Math.round(value * 100) / 100;
}
