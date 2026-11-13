"use client";

import { useEffect, useRef, useState } from "react";
import { costPerGram, filamentName } from "@/lib/costs";
import { money } from "@/lib/format";
import { filamentColors } from "@/lib/labels";
import type { Filament } from "@/lib/types";
import { Swatch } from "./Swatch";

/**
 * Picks one of the workshop's filaments, typing to search (brand, material, colour). `taken` are the ones
 * already used elsewhere in the same form. An empty choice is drawn in red: a filament left unpicked drops
 * its grams and makes the price come out lower than it is.
 */
export function FilamentPicker({
  filaments,
  value,
  taken = [],
  label,
  onChange,
}: {
  filaments: Filament[];
  value: string;
  taken?: string[];
  label: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const current = filaments.find((item) => item.id === value);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = filaments.filter((item) => words.every((word) => filamentName(item).toLowerCase().includes(word)));

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={box} className="relative flex-1">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="input flex items-center gap-2 text-left"
        // Inline: the .input class would win over a utility class.
        style={current ? undefined : { borderColor: "var(--color-bad)", color: "var(--color-bad)" }}
      >
        {current ? (
          <>
            <span className="min-w-0 flex-1 truncate">{filamentName(current)}</span>
            <span className="shrink-0 text-xs text-muted">{money(costPerGram(current) * 1000)}/kg</span>
          </>
        ) : (
          <span className="flex-1">⚠ Falta elegir el filamento</span>
        )}
        <span className="text-muted" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 flex max-h-80 flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          <input
            className="w-full border-b border-line bg-ink px-3 py-2 text-sm text-white outline-none placeholder:text-muted/60"
            autoFocus
            placeholder="Busca: negro, petg, elegoo…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const first = shown.find((item) => item.id === value || !taken.includes(item.id));
                if (first) pick(first.id);
              }
            }}
          />
          <ul role="listbox" className="overflow-y-auto py-1">
            {shown.map((item) => {
              const busy = item.id !== value && taken.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.id === value}
                    disabled={busy}
                    onClick={() => pick(item.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 ${item.id === value ? "bg-brand/15 text-brand" : ""}`}
                  >
                    <Swatch colors={filamentColors(item)} glow={item.glow} className="size-4 shrink-0 rounded-full border border-line" />
                    <span className="min-w-0 flex-1 truncate">{filamentName(item)}</span>
                    <span className="shrink-0 text-xs text-muted">{busy ? "ya está arriba" : `${money(costPerGram(item) * 1000)}/kg`}</span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">Ningún filamento con esa búsqueda.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
