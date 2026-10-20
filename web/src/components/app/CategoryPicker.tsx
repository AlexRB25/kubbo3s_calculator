"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** The 3D-printing categories Kubbo3D keeps up to date (panel admin → Categorías). */
export function useCategoryCatalog() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    supabase()
      .from("product_categories")
      .select("name")
      .order("sort")
      .order("name")
      .then(({ data }) => current && setNames((data ?? []).map((row: { name: string }) => row.name)));
    return () => {
      current = false;
    };
  }, []);
  return names;
}

/**
 * Chooses the categories of a product: as many as fit (a pot can also be a pencil holder), from the
 * Kubbo3D list or written by the user when it is not there.
 */
export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const catalog = useCategoryCatalog();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((item) => item !== name) : [...value, name]);

  const needle = query.trim().toLowerCase();
  // The user's own categories are offered too, next to the list.
  const all = [...catalog, ...value.filter((name) => !catalog.includes(name))];
  const matches = all.filter((name) => !needle || name.toLowerCase().includes(needle));
  const shown = needle || showAll ? matches : matches.slice(0, 14);
  const typed = query.trim();
  const isNew = typed && !all.some((name) => name.toLowerCase() === typed.toLowerCase());

  function addTyped() {
    if (!typed) return;
    const existing = all.find((name) => name.toLowerCase() === typed.toLowerCase());
    const name = existing ?? typed.slice(0, 60);
    if (!value.includes(name)) onChange([...value, name]);
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-on-brand"
              aria-label={`Quitar ${name}`}
            >
              {name} ✕
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTyped();
            }
          }}
          placeholder="Busca o escribe una categoría: macetas, juguetes…"
          maxLength={60}
        />
        {isNew && (
          <button type="button" className="btn" onClick={addTyped}>
            Agregar «{typed}»
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown
          .filter((name) => !value.includes(name))
          .map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-brand hover:text-brand"
            >
              + {name}
            </button>
          ))}
        {!needle && matches.length > 14 && (
          <button type="button" className="px-2 py-1 text-xs text-brand hover:underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Ver menos" : `Ver todas (${matches.length})`}
          </button>
        )}
      </div>
    </div>
  );
}
