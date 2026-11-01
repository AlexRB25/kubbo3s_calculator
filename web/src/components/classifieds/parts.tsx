"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { fromMxn, type Currency } from "@/lib/currency";
import { useDisplayCurrency, useRates } from "@/lib/display-currency";
import { moneyIn } from "@/lib/format";
import { useSession } from "@/lib/session";

/** Frame of a page that needs an account: asks to sign in first, then shows the page. */
export function SignInGate({ back, title, why, children }: { back: { href: string; label: string }; title: string; why: string; children: (session: Session) => ReactNode }) {
  const { session, loading } = useSession();
  const pathname = usePathname();
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <Link href={back.href} className="text-sm text-muted hover:text-white">
        ← {back.label}
      </Link>
      <h1 className="text-2xl">{title}</h1>
      {loading ? (
        <p className="text-muted">Cargando…</p>
      ) : session ? (
        children(session)
      ) : (
        <div className="card flex max-w-md flex-col gap-3">
          <p>{why}</p>
          <Link href={`/entrar?next=${encodeURIComponent(pathname)}`} className="btn btn-primary self-start">
            Entrar o crear cuenta
          </Link>
        </div>
      )}
    </main>
  );
}

/** A price in the seller's currency and, when the visitor shows another one, about how much it is in theirs. */
export function ListingPrice({ price, currency, className = "" }: { price: number; currency: Currency; className?: string }) {
  const shown = useDisplayCurrency();
  const rates = useRates();
  return (
    <span className={className}>
      {moneyIn(price, currency)} {currency}
      {rates && shown !== currency && rates[currency] > 0 && (
        <span className="block text-xs font-normal text-muted">
          ≈ {moneyIn(fromMxn(price / rates[currency], shown, rates), shown)} {shown}
        </span>
      )}
    </span>
  );
}

/** Toggle chips for a list of options (services, modes…). */
export function ChipPicker<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T[]; onChange: (value: T[]) => void }) {
  return (
    <span className="flex flex-wrap gap-2 font-normal">
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((item) => item !== option.value) : [...value, option.value])}
            className="rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:text-white aria-pressed:border-brand aria-pressed:bg-brand/15 aria-pressed:text-white"
          >
            {option.label}
          </button>
        );
      })}
    </span>
  );
}
