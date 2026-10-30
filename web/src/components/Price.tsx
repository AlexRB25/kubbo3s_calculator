"use client";

import { CURRENCIES, fromMxn } from "@/lib/currency";
import { rememberCurrency, useDisplayCurrency, useRates } from "@/lib/display-currency";
import { moneyIn } from "@/lib/format";

/**
 * A price of the store or the marketplace (in Mexican pesos) in the visitor's currency.
 * `charged`: also says what is actually charged, for totals about to be paid.
 */
export function Price({ mxn, charged = false, className }: { mxn: number; charged?: boolean; className?: string }) {
  const currency = useDisplayCurrency();
  const rates = useRates();
  if (currency === "MXN" || !rates) return <span className={className}>{moneyIn(mxn, "MXN")}</span>;
  return (
    <span className={className} title={`Se cobra en pesos mexicanos: ${moneyIn(mxn, "MXN")} MXN`}>
      ≈ {moneyIn(fromMxn(mxn, currency, rates), currency)} {currency}
      {charged && <span className="block text-xs font-normal text-muted">Se cobra {moneyIn(mxn, "MXN")} MXN</span>}
    </span>
  );
}

/** Lets the visitor pick the currency the store and the marketplace are shown in. */
export function CurrencySelect({ className = "" }: { className?: string }) {
  const currency = useDisplayCurrency();
  return (
    <select
      className={`input w-auto py-1.5 text-sm ${className}`}
      aria-label="Moneda"
      value={currency}
      onChange={(event) => rememberCurrency(event.target.value as typeof currency)}
    >
      {CURRENCIES.map((item) => (
        <option key={item.code} value={item.code}>
          {item.code}
        </option>
      ))}
    </select>
  );
}
