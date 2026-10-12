"use client";

import { useSyncExternalStore } from "react";

export type CartLine = { id: string; quantity: number };

const KEY = "kubbo-cart";
const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();

// useSyncExternalStore needs the same array back while nothing changed, so the parsed value is
// cached against the raw string.
let cachedRaw: string | null = null;
let cachedLines: CartLine[] = EMPTY;

function read(): CartLine[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode): the cart just stays empty.
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      cachedLines = Array.isArray(parsed) ? parsed.filter((line) => line?.id && line.quantity > 0) : EMPTY;
    } catch {
      cachedLines = EMPTY;
    }
  }
  return cachedLines;
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the cart.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Lines of the cart kept in this browser. Empty during server rendering. */
export const useCart = () => useSyncExternalStore(subscribe, read, () => EMPTY);

/** Sets how many of a product are in the cart; zero removes it. */
export function setCartQuantity(id: string, quantity: number) {
  const rest = read().filter((line) => line.id !== id);
  write(quantity > 0 ? [...rest, { id, quantity }] : rest);
}

export function addToCart(id: string, quantity: number, max: number) {
  const current = read().find((line) => line.id === id)?.quantity ?? 0;
  setCartQuantity(id, Math.min(current + quantity, max));
}

export const clearCart = () => write([]);
