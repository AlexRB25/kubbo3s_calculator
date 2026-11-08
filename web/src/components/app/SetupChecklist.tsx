"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useData } from "@/lib/data";
import { setupSteps } from "@/lib/setup";

const HIDDEN_KEY = "kubbo3d.setupHidden";

const readHidden = () => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
};
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener));

/** "Completa tu configuración": what a new workshop still needs, until it is all done (or hidden). */
export function SetupChecklist() {
  const { profile, printers, filaments, shop } = useData();
  const hidden = useSyncExternalStore(subscribe, readHidden, () => true);
  const steps = setupSteps({ profile, printers, filaments });
  const done = steps.filter((step) => step.done).length;
  // Settings are the owner's; collaborators work with what is already set.
  if (hidden || done === steps.length || (shop && shop.role !== "owner")) return null;

  function hide() {
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // Without storage it shows again next time.
    }
    listeners.forEach((listener) => listener());
  }

  const next = steps.find((step) => !step.done)!;
  return (
    <section className="card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2>Completa tu configuración</h2>
          <p className="text-sm text-muted">
            {done} de {steps.length} listos · con estos datos tus costos y precios salen reales.
          </p>
        </div>
        <button className="text-xs text-muted hover:text-white" onClick={hide}>
          Ocultar
        </button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.web}
              className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-brand/60 hover:bg-raised/50"
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${step.done ? "bg-money/20 text-money" : "bg-warn/15 text-warn"}`}
                aria-hidden
              >
                {step.done ? "✓" : "!"}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold text-white">{step.title}</span>
                <span className="truncate text-xs text-muted">{step.done ? "Listo" : step.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={next.web} className="btn btn-primary self-start">
        Continuar: {next.title.toLowerCase()} →
      </Link>
    </section>
  );
}
