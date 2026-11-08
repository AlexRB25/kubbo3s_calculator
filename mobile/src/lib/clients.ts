import type { Client, ClientField, ClientFields } from './types';

// Same file in web/src/lib and mobile/src/lib: keep them identical.

/** What the tax id is called where each currency is used; the workshop can rename it. */
const TAX_LABELS: Record<string, string> = {
  MXN: 'RFC',
  COP: 'NIT',
  ARS: 'CUIT',
  PEN: 'RUC',
  CLP: 'RUT',
  BRL: 'CPF / CNPJ',
  UYU: 'RUT',
  PYG: 'RUC',
  BOB: 'NIT',
  VES: 'RIF',
  GTQ: 'NIT',
  HNL: 'RTN',
  NIO: 'RUC',
  CRC: 'Cédula',
  PAB: 'RUC',
  DOP: 'RNC',
  EUR: 'NIF / VAT',
  GBP: 'VAT number',
  CAD: 'Business number',
  USD: 'Tax ID',
};

/** The name of the tax id in this workshop: its own, or the usual one for its currency. */
export const taxLabel = (settings: ClientFields | null | undefined, currency: string) => settings?.tax_label?.trim() || TAX_LABELS[currency] || 'ID fiscal';

/** Fields that invoices usually ask for in some countries; the workshop adds the ones it needs in one tap. */
export const SUGGESTED_FIELDS: Record<string, string[]> = {
  MXN: ['Régimen fiscal', 'Uso de CFDI', 'Código postal fiscal', 'Correo para facturas'],
  COP: ['Tipo de persona', 'Responsabilidad tributaria', 'Correo para factura electrónica'],
  ARS: ['Condición frente al IVA', 'Correo para facturas'],
  PEN: ['Tipo de documento', 'Correo para facturas'],
  CLP: ['Giro', 'Correo para facturas'],
  EUR: ['Código postal fiscal', 'Correo para facturas'],
};
const DEFAULT_SUGGESTIONS = ['Correo para facturas', 'Dirección fiscal'];

export const suggestedFields = (currency: string) => SUGGESTED_FIELDS[currency] ?? DEFAULT_SUGGESTIONS;

/** A field id from its label ("Uso de CFDI" -> "uso-de-cfdi"), unique among `taken`. */
export function fieldId(label: string, taken: string[]) {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'campo';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** A new field with that label, added after the workshop's own. */
export function addField(fields: ClientField[], label: string, onQuote = true): ClientField[] {
  const clean = label.trim();
  if (!clean || fields.some((field) => field.label.toLowerCase() === clean.toLowerCase())) return fields;
  return [...fields, { id: fieldId(clean, fields.map((field) => field.id)), label: clean, on_quote: onQuote }];
}

/** An empty client, ready to fill. */
export const blankClient = (): Omit<Client, 'id' | 'created_at'> => ({
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  legal_name: '',
  tax_id: '',
  extra: {},
  notes: '',
});

/** The client's data a quote keeps a copy of (it does not change if the client is edited later). */
export function quoteClientFields(client: Client | null, settings: ClientFields | null | undefined, currency: string) {
  if (!client) return { client_id: null, client_legal_name: '', client_tax_id: '', client_tax_label: '', client_extra: [] as { label: string; value: string }[] };
  return {
    client_id: client.id,
    client_name: client.name,
    client_phone: client.phone,
    client_email: client.email,
    client_city: client.city,
    client_legal_name: client.legal_name,
    client_tax_id: client.tax_id,
    client_tax_label: client.tax_id ? taxLabel(settings, currency) : '',
    client_extra: (settings?.fields ?? [])
      .filter((field) => field.on_quote && client.extra?.[field.id]?.trim())
      .map((field) => ({ label: field.label, value: client.extra[field.id].trim() })),
  };
}
