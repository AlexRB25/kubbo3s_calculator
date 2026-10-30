"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isCurrency, loadRates, type Currency } from "./currency";

// The currency a visitor sees the store and the marketplace in. Their prices are in Mexican pesos
// (Mercado Pago charges them in pesos); other currencies are shown converted at today's rate.
// It starts as the currency of the visitor's workshop, and they can change it in the header.

const KEY = "kubbo-currency";
const listeners = new Set<() => void>();

function read(): Currency {
  try {
    const value = localStorage.getItem(KEY);
    return isCurrency(value) ? value : "MXN";
  } catch {
    return "MXN";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function rememberCurrency(currency: Currency) {
  try {
    localStorage.setItem(KEY, currency);
  } catch {
    // Private mode: it lasts until the page reloads.
  }
  listeners.forEach((listener) => listener());
}

export const useDisplayCurrency = () => useSyncExternalStore(subscribe, read, () => "MXN" as Currency);

/** Today's rates from Mexican pesos; null until they load. */
export function useRates() {
  const [rates, setRates] = useState<Record<Currency, number> | null>(null);
  useEffect(() => {
    let current = true;
    loadRates().then((value) => current && setRates(value));
    return () => {
      current = false;
    };
  }, []);
  return rates;
}
