"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientForm } from "@/components/app/Clients";
import { publicFile } from "@/components/app/QuoteSettings";
import { Empty, Modal, PageHeader, TableCard } from "@/components/app/ui";
import { quoteClientFields } from "@/lib/clients";
import { overheadPerPiece, priceLevels, productCost } from "@/lib/costs";
import { getWorkshopCurrency, isoDay, moneyIn, num } from "@/lib/format";
import { useData, useSave } from "@/lib/data";
import { blankItem, DRAFT_KEY, QUOTE_STATUS, quoteFolio, quoteHtml, quoteMessage, quoteTotals, type QuoteDraft } from "@/lib/quotes";
import { supabase } from "@/lib/supabase";
import type { Currency } from "@/lib/currency";
import type { Client, Quote, QuoteItem } from "@/lib/types";

const STATUS_STYLE: Record<Quote["status"], string> = {
  pending: "bg-warn/15 text-warn",
  accepted: "bg-money/15 text-money",
  rejected: "bg-bad/15 text-bad",
};

/**
 * Opens the quote as a page and the browser's print dialog, where "Guardar como PDF" saves it. `page` is a
 * window opened earlier, during the click (browsers block windows opened after waiting for the database).
 */
function openPdf(html: string, page: Window | null = window.open("", "_blank")) {
  if (!page) return window.alert("Tu navegador bloqueó la ventana. Permite las ventanas emergentes de Kubbo3D e inténtalo de nuevo.");
  page.document.open();
  page.document.write(html);
  page.document.close();
  // The logo has to load before printing.
  const print = () => setTimeout(() => page.print(), 300);
  if (page.document.readyState === "complete") print();
  else page.addEventListener("load", print);
}

export default function QuotesPage() {
  const { quotes, profile } = useData();
  const { error, save } = useSave();
  const [editing, setEditing] = useState<Quote | "new" | null>(null);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [filter, setFilter] = useState<Quote["status"] | "all">("all");

  // The quick calculator sends its result here to start a new quote.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("nueva")) return;
    let stored: QuoteDraft | null = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      stored = null;
    }
    window.history.replaceState(null, "", "/app/cotizaciones");
    Promise.resolve().then(() => {
      setDraft(stored);
      setEditing("new");
    });
  }, []);

  const business = { name: profile?.business_name || profile?.name || "", settings: profile?.quote_settings ?? {}, logoUrl: publicFile(profile?.quote_settings?.logo_path) };
  const shown = filter === "all" ? quotes : quotes.filter((quote) => quote.status === filter);
  const missingSchema = profile && profile.quote_settings === undefined;

  return (
    <>
      <PageHeader title="Cotizaciones">
        <Link href="/app/calculadora" className="btn">
          Cálculo rápido
        </Link>
        <button className="btn btn-primary" disabled={!!missingSchema} onClick={() => setEditing("new")}>
          Nueva cotización
        </button>
      </PageHeader>
      <p className="text-sm text-muted">
        Arma la cotización, descárgala en PDF o mándala por WhatsApp. Tu logo, teléfono y condiciones se configuran en{" "}
        <Link href="/app/ajustes" className="text-brand">
          Ajustes
        </Link>
        .
      </p>
      {missingSchema && <p className="error">Falta actualizar la base de datos (supabase/schema.sql) para guardar cotizaciones.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {quotes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "accepted", "rejected"] as const).map((value) => (
            <button key={value} className={`btn ${filter === value ? "border-brand text-brand" : ""}`} onClick={() => setFilter(value)}>
              {value === "all" ? `Todas (${quotes.length})` : `${QUOTE_STATUS[value]} (${quotes.filter((quote) => quote.status === value).length})`}
            </button>
          ))}
        </div>
      )}

      {quotes.length === 0 ? (
        <Empty>Aquí aparecen las cotizaciones que hagas para tus clientes. Empieza con el cálculo rápido o con una cotización nueva.</Empty>
      ) : (
        <TableCard>
          <table className="table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th className="num">Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((quote) => (
                <tr key={quote.id}>
                  <td className="font-semibold">{quoteFolio(quote)}</td>
                  <td>{quote.client_name || "—"}</td>
                  <td className="whitespace-nowrap text-muted">{new Date(quote.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="num font-semibold">{moneyIn(quoteTotals(quote).total, quote.currency as Currency)}</td>
                  <td>
                    <select
                      className={`rounded-full border-0 px-3 py-1 text-xs font-semibold ${STATUS_STYLE[quote.status]}`}
                      value={quote.status}
                      onChange={(event) => save(() => supabase().from("quotes").update({ status: event.target.value }).eq("id", quote.id))}
                    >
                      {Object.entries(QUOTE_STATUS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className="btn" onClick={() => openPdf(quoteHtml(quote, business))}>
                        PDF
                      </button>
                      <a
                        className="btn"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://wa.me/${quote.client_phone.replace(/\D/g, "")}?text=${encodeURIComponent(quoteMessage(quote, business.name))}`}
                      >
                        WhatsApp
                      </a>
                      <button className="btn" onClick={() => setEditing(quote)}>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {editing && (
        <Modal title={editing === "new" ? "Nueva cotización" : `Cotización ${quoteFolio(editing)}`} wide onClose={() => setEditing(null)}>
          <QuoteForm quote={editing === "new" ? null : editing} draft={editing === "new" ? draft : null} onDone={() => (setEditing(null), setDraft(null))} onPdf={(quote, page) => openPdf(quoteHtml(quote, business), page)} />
        </Modal>
      )}
    </>
  );
}

/** The date `days` from today, as "2026-11-22". */
const inDays = (days: number) => isoDay(new Date(Date.now() + days * 86400000));

function QuoteForm({ quote, draft, onDone, onPdf }: { quote: Quote | null; draft: QuoteDraft | null; onDone: () => void; onPdf: (quote: Quote, page: Window | null) => void }) {
  const { profile, products, filaments, printers, materials, clients } = useData();
  const { busy, error, setError, save } = useSave();
  // Before the clients table exists a quote keeps only the typed contact.
  const withClients = profile?.client_fields !== undefined;
  const [adding, setAdding] = useState(false);
  const settings = profile?.quote_settings ?? {};
  const currency = (quote?.currency ?? getWorkshopCurrency()) as Currency;
  const validity = Number(settings.validity_days ?? 15);

  const [client, setClient] = useState({
    client_name: quote?.client_name ?? "",
    client_phone: quote?.client_phone ?? "",
    client_email: quote?.client_email ?? "",
    client_city: quote?.client_city ?? "",
  });
  // The saved client it is for and the copy of their invoice data (it does not change if the client is edited later).
  const [fiscal, setFiscal] = useState(() => ({
    client_id: quote?.client_id ?? null,
    client_legal_name: quote?.client_legal_name ?? "",
    client_tax_id: quote?.client_tax_id ?? "",
    client_tax_label: quote?.client_tax_label ?? "",
    client_extra: quote?.client_extra ?? [],
  }));

  function pickClient(picked: Client | null) {
    const copy = quoteClientFields(picked, profile?.client_fields, currency);
    const { client_id, client_legal_name, client_tax_id, client_tax_label, client_extra } = copy;
    setFiscal({ client_id, client_legal_name, client_tax_id, client_tax_label, client_extra });
    if (picked) setClient({ client_name: picked.name, client_phone: picked.phone, client_email: picked.email, client_city: picked.city });
  }
  const [items, setItems] = useState<QuoteItem[]>(quote?.items ?? draft?.items ?? [blankItem()]);
  const [numbers, setNumbers] = useState({
    discount_pct: String(quote?.discount_pct ?? draft?.discount_pct ?? ""),
    tax_pct: String(quote?.tax_pct ?? draft?.tax_pct ?? settings.tax_pct ?? 16),
    shipping: String(quote?.shipping ?? ""),
  });
  const [texts, setTexts] = useState({
    payment_terms: quote?.payment_terms ?? settings.payment_terms ?? "",
    delivery: quote?.delivery ?? settings.delivery ?? "",
    notes: quote?.notes ?? settings.notes ?? "",
    valid_until: quote?.valid_until ?? (validity > 0 ? inDays(validity) : ""),
  });

  const row = {
    ...client,
    ...(withClients ? fiscal : {}),
    ...texts,
    valid_until: texts.valid_until || null,
    items: items.filter((item) => item.name.trim()).map((item) => ({ ...item, name: item.name.trim(), detail: item.detail.trim(), quantity: num(String(item.quantity)) || 1, unit_price: num(String(item.unit_price)) })),
    discount_pct: num(numbers.discount_pct),
    tax_pct: num(numbers.tax_pct),
    shipping: num(numbers.shipping),
  };
  const totals = quoteTotals(row);
  const cash = (amount: number) => moneyIn(amount, currency);

  const setItem = (index: number, patch: Partial<QuoteItem>) => setItems((list) => list.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  function addProduct(id: string) {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const cost = productCost(product, filaments, printers, profile?.kwh_price ?? 0, materials, profile?.waste_rules, overheadPerPiece(profile)).total;
    const price = Math.round(cost * (1 + priceLevels(profile, product).normal / 100) * 100) / 100;
    setItems((list) => [...list.filter((item) => item.name.trim()), { name: product.name, detail: "", quantity: 1, unit_price: price }]);
  }

  function submit(andPdf: boolean) {
    if (!row.items.length) return setError("Agrega al menos un concepto con nombre.");
    const page = andPdf ? window.open("", "_blank") : null;
    page?.document.write("<p style='font-family:sans-serif'>Preparando la cotización…</p>");
    save(
      async () => {
        const result = quote
          ? await supabase().from("quotes").update(row).eq("id", quote.id).select().single()
          : await supabase().from("quotes").insert({ ...row, currency }).select().single();
        if (result.error) page?.close();
        else if (andPdf) onPdf(result.data as Quote, page);
        return result;
      },
      onDone,
    );
  }

  const text = (value: string, set: (value: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="input" value={value} onChange={(event) => set(event.target.value)} {...props} />
  );

  return (
    <div className="flex flex-col gap-5">
      {withClients && (
        <section className="flex flex-wrap items-end gap-2">
          <label className="label min-w-60 flex-1">
            Cliente guardado
            <select
              className="input"
              value={fiscal.client_id ?? ""}
              onChange={(event) => pickClient(clients.find((item) => item.id === event.target.value) ?? null)}
            >
              <option value="">— Escribir los datos a mano —</option>
              {clients.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.tax_id ? ` · ${item.tax_id}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Nuevo cliente
          </button>
        </section>
      )}
      {fiscal.client_tax_id || fiscal.client_legal_name || fiscal.client_extra.length ? (
        <p className="rounded-lg border border-line p-3 text-xs text-muted">
          En el PDF: {[fiscal.client_legal_name, fiscal.client_tax_id && `${fiscal.client_tax_label}: ${fiscal.client_tax_id}`, ...fiscal.client_extra.map((item) => `${item.label}: ${item.value}`)].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          Cliente
          {text(client.client_name, (value) => setClient({ ...client, client_name: value }), { placeholder: "Nombre o empresa" })}
        </label>
        <label className="label">
          WhatsApp o teléfono
          {text(client.client_phone, (value) => setClient({ ...client, client_phone: value }), { placeholder: "52 55 1234 5678", inputMode: "tel" })}
        </label>
        <label className="label">
          Correo
          {text(client.client_email, (value) => setClient({ ...client, client_email: value }), { type: "email" })}
        </label>
        <label className="label">
          Ciudad
          {text(client.client_city, (value) => setClient({ ...client, client_city: value }))}
        </label>
      </section>

      {adding && (
        <Modal title="Nuevo cliente" wide onClose={() => setAdding(false)}>
          <ClientForm
            client={null}
            onDone={(saved) => {
              setAdding(false);
              if (saved) pickClient(saved);
            }}
          />
        </Modal>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Conceptos</h3>
          {products.length > 0 && (
            <select className="input w-auto" value="" onChange={(event) => addProduct(event.target.value)}>
              <option value="">+ Agregar de mis productos</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {items.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_90px_130px_auto] sm:items-end">
            <div className="flex flex-col gap-2">
              <input className="input" value={item.name} placeholder="Concepto" onChange={(event) => setItem(index, { name: event.target.value })} />
              <input className="input text-sm" value={item.detail} placeholder="Detalle: material, color, medidas…" onChange={(event) => setItem(index, { detail: event.target.value })} />
            </div>
            <label className="label">
              Cantidad
              <input className="input" inputMode="decimal" value={item.quantity || ""} onChange={(event) => setItem(index, { quantity: num(event.target.value) })} />
            </label>
            <label className="label">
              Precio unitario
              <input
                className="input"
                inputMode="decimal"
                defaultValue={item.unit_price || ""}
                key={`${index}-${item.unit_price}`}
                onBlur={(event) => setItem(index, { unit_price: num(event.target.value) })}
              />
            </label>
            <button type="button" className="btn" aria-label="Quitar concepto" onClick={() => setItems((list) => (list.length > 1 ? list.filter((_, at) => at !== index) : [blankItem()]))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn self-start" onClick={() => setItems((list) => [...list, blankItem()])}>
          + Otro concepto
        </button>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <label className="label">
          Descuento (%)
          {text(numbers.discount_pct, (value) => setNumbers({ ...numbers, discount_pct: value }), { inputMode: "decimal", placeholder: "0" })}
        </label>
        <label className="label">
          Impuestos (%)
          {text(numbers.tax_pct, (value) => setNumbers({ ...numbers, tax_pct: value }), { inputMode: "decimal", placeholder: "0" })}
        </label>
        <label className="label">
          Envío
          {text(numbers.shipping, (value) => setNumbers({ ...numbers, shipping: value }), { inputMode: "decimal", placeholder: "0" })}
        </label>
        <label className="label">
          Vigente hasta
          {text(texts.valid_until, (value) => setTexts({ ...texts, valid_until: value }), { type: "date" })}
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          Condiciones de pago
          <textarea className="input" rows={2} value={texts.payment_terms} onChange={(event) => setTexts({ ...texts, payment_terms: event.target.value })} />
        </label>
        <label className="label">
          Entrega
          <textarea className="input" rows={2} value={texts.delivery} onChange={(event) => setTexts({ ...texts, delivery: event.target.value })} />
        </label>
        <label className="label sm:col-span-2">
          Notas
          <textarea className="input" rows={2} value={texts.notes} onChange={(event) => setTexts({ ...texts, notes: event.target.value })} />
        </label>
      </section>

      <div className="flex flex-col gap-1 rounded-xl border border-line p-4 text-sm">
        <p className="flex justify-between">
          <span className="text-muted">Subtotal</span>
          <span className="tabular-nums">{cash(totals.subtotal)}</span>
        </p>
        {totals.discount > 0 && (
          <p className="flex justify-between">
            <span className="text-muted">Descuento</span>
            <span className="tabular-nums">−{cash(totals.discount)}</span>
          </p>
        )}
        {totals.tax > 0 && (
          <p className="flex justify-between">
            <span className="text-muted">Impuestos</span>
            <span className="tabular-nums">{cash(totals.tax)}</span>
          </p>
        )}
        {totals.shipping > 0 && (
          <p className="flex justify-between">
            <span className="text-muted">Envío</span>
            <span className="tabular-nums">{cash(totals.shipping)}</span>
          </p>
        )}
        <p className="mt-1 flex justify-between border-t border-line pt-2 text-base font-bold">
          <span>Total</span>
          <span className="text-brand tabular-nums">{cash(totals.total)}</span>
        </p>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => submit(true)}>
          {busy ? "Guardando…" : "Guardar y ver PDF"}
        </button>
        <button className="btn" disabled={busy} onClick={() => submit(false)}>
          Guardar
        </button>
        {quote && (
          <button
            className="btn btn-danger ml-auto"
            disabled={busy}
            onClick={() => window.confirm(`¿Eliminar la cotización ${quoteFolio(quote)}?`) && save(() => supabase().from("quotes").delete().eq("id", quote.id), onDone)}
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}
