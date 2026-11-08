"use client";

import { useState } from "react";
import { Switch } from "@/components/app/ui";
import { addField, blankClient, suggestedFields, taxLabel } from "@/lib/clients";
import { useData, useSave } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type { Client, ClientFields } from "@/lib/types";

/** Add or edit a client. `onDone` receives the saved client (the quote form selects it). */
export function ClientForm({ client, onDone }: { client: Client | null; onDone: (saved?: Client) => void }) {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();
  const settings = profile?.client_fields ?? {};
  const fields = settings.fields ?? [];
  const [values, setValues] = useState(() => ({ ...blankClient(), ...(client ?? {}) }));
  const set = (patch: Partial<typeof values>) => setValues((current) => ({ ...current, ...patch }));

  function submit() {
    if (!values.name.trim()) return setError("Escribe el nombre del cliente.");
    const row = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      email: values.email.trim(),
      address: values.address.trim(),
      city: values.city.trim(),
      legal_name: values.legal_name.trim(),
      tax_id: values.tax_id.trim(),
      notes: values.notes.trim(),
      // Only the fields the workshop still has; a value of a removed field is dropped.
      extra: Object.fromEntries(fields.map((field) => [field.id, (values.extra?.[field.id] ?? "").trim()]).filter(([, value]) => value)),
    };
    let saved: Client | undefined;
    save(
      async () => {
        const result = client
          ? await supabase().from("clients").update(row).eq("id", client.id).select().single()
          : await supabase().from("clients").insert(row).select().single();
        saved = (result.data as Client | null) ?? undefined;
        return result;
      },
      () => onDone(saved),
    );
  }

  const input = (key: "name" | "phone" | "email" | "address" | "city" | "legal_name" | "tax_id", text: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="label">
      {text}
      <input className="input" value={values[key]} onChange={(event) => set({ [key]: event.target.value })} {...props} />
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2">
        {input("name", "Nombre o empresa *", { autoFocus: true })}
        {input("phone", "WhatsApp o teléfono", { inputMode: "tel" })}
        {input("email", "Correo", { type: "email" })}
        {input("city", "Ciudad")}
        <div className="sm:col-span-2">{input("address", "Dirección")}</div>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Facturación</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {input("legal_name", "Nombre fiscal o razón social")}
          {input("tax_id", taxLabel(settings, profile?.currency ?? "MXN"))}
          {fields.map((field) => (
            <label key={field.id} className="label">
              {field.label}
              <input className="input" value={values.extra?.[field.id] ?? ""} onChange={(event) => set({ extra: { ...values.extra, [field.id]: event.target.value } })} />
            </label>
          ))}
        </div>
        {fields.length === 0 && <p className="text-xs text-muted">¿Tus facturas piden más datos? Agrégalos en «Campos de facturación».</p>}
      </section>
      <label className="label">
        Notas
        <textarea className="input" rows={2} value={values.notes} onChange={(event) => set({ notes: event.target.value })} />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Guardando…" : client ? "Guardar" : "Dar de alta"}
        </button>
        {client && (
          <button
            className="btn btn-danger ml-auto"
            disabled={busy}
            onClick={() =>
              window.confirm(`¿Eliminar a ${client.name}? Sus cotizaciones se conservan.`) && save(() => supabase().from("clients").delete().eq("id", client.id), () => onDone())
            }
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

/** The name of the tax id and the client fields the workshop needs for its invoices. */
export function FieldsSettings({ settings, onDone }: { settings: ClientFields; onDone: () => void }) {
  const { profile } = useData();
  const { busy, error, save } = useSave();
  const currency = profile?.currency ?? "MXN";
  const [label, setLabel] = useState(settings.tax_label ?? "");
  const [fields, setFields] = useState(settings.fields ?? []);
  const [adding, setAdding] = useState("");
  const missing = suggestedFields(currency).filter((name) => !fields.some((field) => field.label.toLowerCase() === name.toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      <label className="label">
        ¿Cómo se llama el ID fiscal en tu país?
        <input className="input" value={label} placeholder={taxLabel({}, currency)} onChange={(event) => setLabel(event.target.value)} />
        <span className="font-normal">Vacío = {taxLabel({}, currency)}.</span>
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Campos propios</span>
        {fields.length === 0 && <p className="text-sm text-muted">Sin campos extra. Agrega los que pidan tus facturas.</p>}
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
            <input
              className="input flex-1"
              value={field.label}
              onChange={(event) => setFields(fields.map((item, at) => (at === index ? { ...item, label: event.target.value } : item)))}
            />
            <span className="flex items-center gap-2 text-xs text-muted">
              <Switch
                checked={field.on_quote}
                label="Sale en la cotización"
                onChange={(on) => setFields(fields.map((item, at) => (at === index ? { ...item, on_quote: on } : item)))}
              />
              En PDF
            </span>
            <button className="btn" aria-label={`Quitar ${field.label}`} onClick={() => setFields(fields.filter((_, at) => at !== index))}>
              ✕
            </button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setFields(addField(fields, adding));
            setAdding("");
          }}
        >
          <input className="input flex-1" placeholder="Nuevo campo, p. ej. Régimen fiscal" value={adding} onChange={(event) => setAdding(event.target.value)} />
          <button className="btn" disabled={!adding.trim()}>
            Agregar
          </button>
        </form>
        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Sugeridos:</span>
            {missing.map((name) => (
              <button key={name} className="btn py-1 text-xs" onClick={() => setFields(addField(fields, name))}>
                + {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="btn btn-primary self-start"
        disabled={busy}
        onClick={() =>
          save(
            () =>
              supabase()
                .from("profiles")
                .update({ client_fields: { tax_label: label.trim(), fields: fields.filter((field) => field.label.trim()).map((field) => ({ ...field, label: field.label.trim() })) } })
                .eq("id", profile!.id),
            onDone,
          )
        }
      >
        {busy ? "Guardando…" : "Guardar campos"}
      </button>
    </div>
  );
}
