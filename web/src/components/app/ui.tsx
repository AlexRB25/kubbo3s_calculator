"use client";

import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { useSave, type WriteResult } from "@/lib/data";

export function PageHeader({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1>{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${tone === "good" ? "text-money" : tone === "bad" ? "text-bad" : ""}`}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** Label on the left, amount on the right: one line of a cost or sale breakdown. */
export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className={`flex justify-between gap-4 text-sm ${strong ? "border-t border-line pt-2 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}

export function Empty({ children }: PropsWithChildren) {
  return <p className="card text-center text-sm text-muted">{children}</p>;
}

/** Wraps a table so it scrolls sideways on narrow screens instead of breaking the page. */
export function TableCard({ children }: PropsWithChildren) {
  return <div className="card overflow-x-auto p-0">{children}</div>;
}

export function Modal({ title, onClose, wide, children }: PropsWithChildren<{ title: string; onClose: () => void; wide?: boolean }>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={`card my-8 flex w-full flex-col gap-4 ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "date" | "select" | "color";
  /** For selects. */
  options?: { value: string; label: string }[];
  /** Label of the empty choice of a select; omit to force one. */
  none?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** Takes the whole row of the two-column grid. */
  wide?: boolean;
};

export type FieldValues = Record<string, string | number | null>;

type FieldsFormProps = {
  fields: FieldDef[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
  /** Receives the typed values: numbers as numbers, empty selects and dates as null, text trimmed. */
  onSubmit: (values: FieldValues) => PromiseLike<WriteResult>;
  /** Shows a delete button that asks with `deleteConfirm` first. */
  onDelete?: () => PromiseLike<WriteResult>;
  deleteConfirm?: string;
  onDone?: () => void;
  children?: ReactNode;
};

/** A plain form described by its fields. Covers every simple record of the workshop. */
export function FieldsForm({ fields, initial, submitLabel = "Guardar", onSubmit, onDelete, deleteConfirm, onDone, children }: FieldsFormProps) {
  const { busy, error, save } = useSave();
  // Forms that stay on screen after saving (no `onDone`) confirm it here.
  const [saved, setSaved] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: FieldValues = {};
    for (const field of fields) {
      const raw = String(form.get(field.name) ?? "").trim();
      if (field.type === "number") values[field.name] = Number(raw) || 0;
      else if (field.type === "select" || field.type === "date") values[field.name] = raw || null;
      else values[field.name] = raw;
    }
    setSaved(false);
    save(() => onSubmit(values), onDone ?? (() => setSaved(true)));
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const value = initial?.[field.name];
        const common = {
          name: field.name,
          required: field.required,
          defaultValue: value == null ? "" : String(value),
          className: "input",
        };
        return (
          <label key={field.name} className={`label ${field.wide || field.type === "textarea" ? "sm:col-span-2" : ""}`}>
            {field.label}
            {field.type === "textarea" ? (
              <textarea {...common} placeholder={field.placeholder} rows={3} />
            ) : field.type === "select" ? (
              <select {...common}>
                {(field.none || !field.required) && <option value="">{field.none ?? "—"}</option>}
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...common}
                placeholder={field.placeholder}
                type={field.type ?? "text"}
                step={field.type === "number" ? "any" : undefined}
                min={field.type === "number" ? 0 : undefined}
                className={field.type === "color" ? "h-10 w-20 cursor-pointer rounded-lg border border-line bg-ink" : "input"}
              />
            )}
            {field.hint && <span className="font-normal">{field.hint}</span>}
          </label>
        );
      })}
      {children && <div className="sm:col-span-2">{children}</div>}
      {error && (
        <p role="alert" className="error sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Guardando…" : submitLabel}
        </button>
        {saved && (
          <span role="status" className="self-center text-sm text-money">
            Guardado
          </span>
        )}
        {onDelete && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(deleteConfirm ?? "¿Eliminar?")) save(onDelete, onDone);
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </form>
  );
}

/** An on/off switch (a checkbox that looks like a toggle). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${checked ? "border-brand bg-brand" : "border-line bg-raised"}`}
    >
      <span className={`inline-block size-4 rounded-full bg-white shadow transition ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}
