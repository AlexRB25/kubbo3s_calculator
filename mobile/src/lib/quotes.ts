import type { Currency } from './currency';
import { moneyIn } from './format';
import type { Printer, Quote, QuoteItem, QuoteSettings } from './types';

// Same file in web/src/lib and mobile/src/lib: keep them identical.

export const QUOTE_STATUS: Record<Quote['status'], string> = { pending: 'En espera', accepted: 'Aceptada', rejected: 'Rechazada' };

/** "COT-0007" */
export const quoteFolio = (quote: Pick<Quote, 'number'>) => `COT-${String(quote.number).padStart(4, '0')}`;

/** What a quote adds up to: the lines, the discount over them, the tax over what is left, and the shipping on top. */
export function quoteTotals(quote: Pick<Quote, 'items' | 'discount_pct' | 'tax_pct' | 'shipping'>) {
  const subtotal = quote.items.reduce((total, item) => total + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
  const discount = (subtotal * (Number(quote.discount_pct) || 0)) / 100;
  const tax = ((subtotal - discount) * (Number(quote.tax_pct) || 0)) / 100;
  const shipping = Number(quote.shipping) || 0;
  return { subtotal, discount, tax, shipping, total: subtotal - discount + tax + shipping };
}

/** A quote started elsewhere (the quick calculator) and picked up by the quote form. */
export const DRAFT_KEY = "kubbo3d.quoteDraft";
export type QuoteDraft = { items: QuoteItem[]; discount_pct: number; tax_pct: number };

/** An empty line, ready to fill. */
export const blankItem = (): QuoteItem => ({ name: '', detail: '', quantity: 1, unit_price: 0 });

export type QuickInput = {
  /** Grams of each filament the piece takes and what a gram of it costs. */
  filaments: { grams: number; costPerGram: number }[];
  minutes: number;
  /** The printer it is printed on (its power and wear per hour); none = no electricity nor wear. */
  printer?: Pick<Printer, 'power_watts' | 'hourly_cost'> | null;
  kwhPrice: number;
  /** Extra filament for failed pieces and purges, in %. */
  wastePct: number;
  /** Sanding, painting, assembling… what one piece takes by hand. */
  post: number;
  packaging: number;
  /** Its share of the workshop's fixed costs. */
  overhead: number;
};

export type QuickCost = { filament: number; electricity: number; machine: number; post: number; packaging: number; overhead: number; total: number };

/** What one piece costs, without having to create a product first. */
export function quickCost(input: QuickInput): QuickCost {
  const filament = input.filaments.reduce((total, use) => total + (Number(use.grams) || 0) * (Number(use.costPerGram) || 0), 0) * (1 + (Number(input.wastePct) || 0) / 100);
  const hours = (Number(input.minutes) || 0) / 60;
  const electricity = input.printer ? hours * ((Number(input.printer.power_watts) || 0) / 1000) * (Number(input.kwhPrice) || 0) : 0;
  const machine = input.printer ? hours * (Number(input.printer.hourly_cost) || 0) : 0;
  const post = Number(input.post) || 0;
  const packaging = Number(input.packaging) || 0;
  const overhead = Number(input.overhead) || 0;
  return { filament, electricity, machine, post, packaging, overhead, total: filament + electricity + machine + post + packaging + overhead };
}

const escape = (text: string) =>
  String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const lines = (text: string) => escape(text).replace(/\n/g, '<br>');

const longDay = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

export type QuoteBusiness = { name: string; settings: QuoteSettings; logoUrl?: string | null };

/** The quote as a printable page (A4): the web prints it to PDF and the app turns it into a PDF file. */
export function quoteHtml(quote: Quote, business: QuoteBusiness) {
  const currency = quote.currency as Currency;
  const cash = (amount: number) => escape(moneyIn(amount, currency));
  const totals = quoteTotals(quote);
  const contact = [business.settings.phone, business.settings.email, business.settings.address].filter((text): text is string => !!text).map((text) => lines(text)).join('<br>');
  const client = [
    quote.client_legal_name && quote.client_legal_name !== quote.client_name ? quote.client_legal_name : '',
    quote.client_tax_id ? `${quote.client_tax_label || 'ID fiscal'}: ${quote.client_tax_id}` : '',
    ...(quote.client_extra ?? []).map((field) => `${field.label}: ${field.value}`),
    quote.client_email,
    quote.client_phone,
    quote.client_city,
  ]
    .filter((text): text is string => !!text)
    .map((text) => escape(text))
    .join('<br>');
  const conditions = [
    ['Condiciones de pago', quote.payment_terms],
    ['Entrega', quote.delivery],
  ].filter(([, text]) => text);
  const rows = quote.items
    .map(
      (item) => `<tr>
        <td><strong>${escape(item.name)}</strong>${item.detail ? `<div class="muted">${escape(item.detail)}</div>` : ''}</td>
        <td class="num">${escape(String(item.quantity))}</td>
        <td class="num">${cash(item.unit_price)}</td>
        <td class="num">${cash((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}</td>
      </tr>`,
    )
    .join('');
  const sum = (label: string, amount: number, show = true) => (show ? `<div class="sum"><span>${label}</span><span>${cash(amount)}</span></div>` : '');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cotización ${quoteFolio(quote)}${quote.client_name ? ` · ${escape(quote.client_name)}` : ''}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; font-size: 12px; margin: 0; line-height: 1.45; }
  .head { display: flex; justify-content: space-between; gap: 16px; border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px; }
  .brand { display: flex; gap: 12px; align-items: flex-start; }
  .brand img { width: 64px; height: 64px; object-fit: contain; border-radius: 10px; }
  .brand h1 { font-size: 16px; margin: 0 0 4px; }
  .title { text-align: right; }
  .title h2 { color: #0E9AAB; font-size: 22px; margin: 0 0 6px; }
  .muted { color: #6B7280; font-size: 11px; }
  .box { border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 16px; margin-top: 12px; }
  .label { font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #6B7280; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #0E9AAB; color: #fff; text-align: left; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #F3F4F6; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .bottom { display: flex; gap: 16px; margin-top: 12px; align-items: flex-start; }
  .bottom > div { flex: 1; }
  .sums { border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px 16px; }
  .sum { display: flex; justify-content: space-between; padding: 3px 0; }
  .total { display: flex; justify-content: space-between; margin-top: 8px; background: #0E9AAB; color: #fff; border-radius: 8px; padding: 10px 12px; font-size: 15px; font-weight: 800; }
  p { margin: 0 0 8px; }
  @media screen { body { max-width: 820px; margin: 0 auto; padding: 24px; } }
</style></head>
<body>
  <div class="head">
    <div class="brand">
      ${business.logoUrl ? `<img src="${escape(business.logoUrl)}" alt="">` : ''}
      <div><h1>${escape(business.name || 'Mi taller')}</h1><div class="muted">${contact}</div></div>
    </div>
    <div class="title">
      <h2>Cotización</h2>
      <div class="muted">Folio: <strong>${quoteFolio(quote)}</strong></div>
      <div class="muted">Fecha: <strong>${longDay(quote.created_at)}</strong></div>
      ${quote.valid_until ? `<div class="muted">Vigencia: <strong>${longDay(quote.valid_until)}</strong></div>` : ''}
    </div>
  </div>
  ${
    quote.client_name || client
      ? `<div class="box"><div class="label">Cliente</div><strong>${escape(quote.client_name || '—')}</strong>${client ? `<div class="muted">${client}</div>` : ''}</div>`
      : ''
  }
  <table>
    <thead><tr><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio unitario</th><th class="num">Importe</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom">
    <div>
      ${conditions.map(([label, text]) => `<div class="label">${label}</div><p>${lines(text)}</p>`).join('')}
      ${quote.notes ? `<div class="label">Notas</div><p>${lines(quote.notes)}</p>` : ''}
    </div>
    <div class="sums">
      ${sum('Subtotal', totals.subtotal)}
      ${sum(`Descuento (${Number(quote.discount_pct)} %)`, -totals.discount, totals.discount > 0)}
      ${sum(`Impuestos (${Number(quote.tax_pct)} %)`, totals.tax, totals.tax > 0)}
      ${sum('Envío', totals.shipping, totals.shipping > 0)}
      <div class="total"><span>Total</span><span>${cash(totals.total)}</span></div>
      <div class="muted" style="margin-top:6px">Precios en ${escape(currency)}</div>
    </div>
  </div>
</body></html>`;
}

/** A short text to send by WhatsApp with the quote. */
export function quoteMessage(quote: Quote, businessName: string) {
  const total = moneyIn(quoteTotals(quote).total, quote.currency as Currency);
  const greeting = quote.client_name ? `Hola ${quote.client_name.split(' ')[0]}, ` : 'Hola, ';
  const items = quote.items.map((item) => `• ${item.quantity} × ${item.name}`).join('\n');
  const valid = quote.valid_until ? `\nVigencia: ${longDay(quote.valid_until)}` : '';
  return `${greeting}te comparto la cotización ${quoteFolio(quote)}${businessName ? ` de ${businessName}` : ''}:\n${items}\nTotal: ${total}${valid}`;
}
