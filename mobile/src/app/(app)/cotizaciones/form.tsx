import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Chips, confirmDelete, ErrorText, Field, Heading, Line, Row, Screen, Select } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { overheadPerPiece, priceLevels, productCost } from '@/lib/costs';
import { type Currency } from '@/lib/currency';
import { getWorkshopCurrency, isIsoDay, isoDay, moneyIn, num } from '@/lib/format';
import { sendQuoteWhatsApp, shareQuotePdf, takeQuoteDraft } from '@/lib/quote-share';
import { blankItem, QUOTE_STATUS, quoteFolio, quoteTotals } from '@/lib/quotes';
import { supabase } from '@/lib/supabase';
import type { Quote, QuoteItem } from '@/lib/types';
import { useData, useSave } from '@/store/data';

type ItemDraft = { name: string; detail: string; quantity: string; unit_price: string };

const toLine = (item: QuoteItem): ItemDraft => ({
  name: item.name,
  detail: item.detail,
  quantity: item.quantity ? String(item.quantity) : '',
  unit_price: item.unit_price ? String(item.unit_price) : '',
});

/** The date `days` from today, as "2026-11-22". */
const inDays = (days: number) => isoDay(new Date(Date.now() + days * 86400000));

export default function QuoteFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { quotes, profile, products, filaments, printers, materials } = useData();
  const { busy, error, setError, save } = useSave();
  const quote = quotes.find((item) => item.id === id) ?? null;
  const settings = profile?.quote_settings ?? {};
  const currency = (quote?.currency ?? getWorkshopCurrency()) as Currency;
  const validity = Number(settings.validity_days ?? 15);

  // The quick calculator leaves its result here for a new quote.
  const [draft] = useState(() => (quote ? null : takeQuoteDraft()));
  const [client, setClient] = useState({
    client_name: quote?.client_name ?? '',
    client_phone: quote?.client_phone ?? '',
    client_email: quote?.client_email ?? '',
    client_city: quote?.client_city ?? '',
  });
  const [lines, setLines] = useState<ItemDraft[]>((quote?.items ?? draft?.items ?? [blankItem()]).map(toLine));
  const [discount, setDiscount] = useState(String(quote?.discount_pct ?? draft?.discount_pct ?? '') || '');
  const [tax, setTax] = useState(String(quote?.tax_pct ?? draft?.tax_pct ?? settings.tax_pct ?? 16));
  const [shipping, setShipping] = useState(quote?.shipping ? String(quote.shipping) : '');
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? (validity > 0 ? inDays(validity) : ''));
  const [payment, setPayment] = useState(quote?.payment_terms ?? settings.payment_terms ?? '');
  const [delivery, setDelivery] = useState(quote?.delivery ?? settings.delivery ?? '');
  const [notes, setNotes] = useState(quote?.notes ?? settings.notes ?? '');

  const items: QuoteItem[] = lines
    .filter((line) => line.name.trim())
    .map((line) => ({ name: line.name.trim(), detail: line.detail.trim(), quantity: num(line.quantity) || 1, unit_price: num(line.unit_price) }));
  const row = {
    ...client,
    items,
    discount_pct: num(discount),
    tax_pct: num(tax),
    shipping: num(shipping),
    valid_until: validUntil || null,
    payment_terms: payment.trim(),
    delivery: delivery.trim(),
    notes: notes.trim(),
  };
  const totals = quoteTotals(row);
  const cash = (amount: number) => moneyIn(amount, currency);

  const setLine = (index: number, patch: Partial<ItemDraft>) => setLines((list) => list.map((line, at) => (at === index ? { ...line, ...patch } : line)));

  function addProduct(productId: string | null) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const cost = productCost(product, filaments, printers, profile?.kwh_price ?? 0, materials, profile?.waste_rules, overheadPerPiece(profile)).total;
    const price = Math.round(cost * (1 + priceLevels(profile, product).normal / 100) * 100) / 100;
    setLines((list) => [...list.filter((line) => line.name.trim()), toLine({ name: product.name, detail: '', quantity: 1, unit_price: price })]);
  }

  function submit(andShare: boolean) {
    if (!items.length) return setError('Agrega al menos un concepto con nombre.');
    if (validUntil && !isIsoDay(validUntil)) return setError('Escribe la vigencia como AAAA-MM-DD.');
    let saved: Quote | null = null;
    save(
      async () => {
        const result = quote
          ? await supabase.from('quotes').update(row).eq('id', quote.id).select().single()
          : await supabase.from('quotes').insert({ ...row, currency }).select().single();
        saved = (result.data as Quote | null) ?? null;
        return result;
      },
      () => {
        router.back();
        if (andShare && saved) shareQuotePdf(saved, profile);
      },
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: quote ? `Cotización ${quoteFolio(quote)}` : 'Nueva cotización' }} />

      {quote && (
        <Card>
          <Chips
            label="Estado"
            options={Object.entries(QUOTE_STATUS).map(([value, label]) => ({ value: value as Quote['status'], label }))}
            value={quote.status}
            onChange={(status) => save(() => supabase.from('quotes').update({ status }).eq('id', quote.id), () => {})}
          />
          <Row>
            <Button style={{ flex: 1 }} icon="share" label="PDF" onPress={() => shareQuotePdf(quote, profile)} />
            <Button style={{ flex: 1 }} variant="money" icon="logo-whatsapp" label="WhatsApp" onPress={() => sendQuoteWhatsApp(quote, profile)} />
          </Row>
        </Card>
      )}

      <Card>
        <Heading>Cliente</Heading>
        <Field label="Nombre o empresa" value={client.client_name} onChangeText={(value) => setClient({ ...client, client_name: value })} />
        <Field
          label="WhatsApp o teléfono"
          value={client.client_phone}
          onChangeText={(value) => setClient({ ...client, client_phone: value })}
          keyboardType="phone-pad"
          placeholder="52 55 1234 5678"
        />
        <Row>
          <Field
            style={{ flex: 1 }}
            label="Correo"
            value={client.client_email}
            onChangeText={(value) => setClient({ ...client, client_email: value })}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field style={{ flex: 1 }} label="Ciudad" value={client.client_city} onChangeText={(value) => setClient({ ...client, client_city: value })} />
        </Row>
      </Card>

      <Card>
        <Heading>Conceptos</Heading>
        {lines.map((line, index) => (
          <View key={index} style={{ gap: Spacing.two, borderBottomColor: Colors.border, borderBottomWidth: 1, paddingBottom: Spacing.three }}>
            <Field label="Concepto" value={line.name} onChangeText={(value) => setLine(index, { name: value })} />
            <Field label="Detalle" value={line.detail} onChangeText={(value) => setLine(index, { detail: value })} placeholder="Material, color, medidas…" />
            <Row>
              <Field style={{ flex: 1 }} label="Cantidad" numeric value={line.quantity} onChangeText={(value) => setLine(index, { quantity: value })} placeholder="1" />
              <Field style={{ flex: 2 }} label="Precio unitario" unit="$" numeric value={line.unit_price} onChangeText={(value) => setLine(index, { unit_price: value })} />
            </Row>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLines((list) => (list.length > 1 ? list.filter((_, at) => at !== index) : [toLine(blankItem())]))}>
              <Text style={{ color: Colors.danger }}>Quitar concepto</Text>
            </Pressable>
          </View>
        ))}
        <Button variant="secondary" icon="add" label="Otro concepto" onPress={() => setLines((list) => [...list, toLine(blankItem())])} />
        {products.length > 0 && (
          <Select
            label="Agregar de mis productos"
            value={null}
            onChange={addProduct}
            placeholder="Elegir producto…"
            options={products.map((product) => ({ value: product.id, label: product.name }))}
          />
        )}
      </Card>

      <Card>
        <Row>
          <Field style={{ flex: 1 }} label="Descuento" unit="%" numeric value={discount} onChangeText={setDiscount} placeholder="0" />
          <Field style={{ flex: 1 }} label="Impuestos" unit="%" numeric value={tax} onChangeText={setTax} placeholder="0" />
        </Row>
        <Row>
          <Field style={{ flex: 1 }} label="Envío" unit="$" numeric value={shipping} onChangeText={setShipping} placeholder="0" />
          <Field style={{ flex: 1 }} label="Vigente hasta" value={validUntil} onChangeText={setValidUntil} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" />
        </Row>
        <Field label="Condiciones de pago" value={payment} onChangeText={setPayment} multiline placeholder="50 % de anticipo y el resto al entregar" />
        <Field label="Entrega" value={delivery} onChangeText={setDelivery} multiline />
        <Field label="Notas" value={notes} onChangeText={setNotes} multiline />
      </Card>

      <Card>
        <Line label="Subtotal" value={cash(totals.subtotal)} />
        {totals.discount > 0 && <Line label="Descuento" value={`−${cash(totals.discount)}`} />}
        {totals.tax > 0 && <Line label="Impuestos" value={cash(totals.tax)} />}
        {totals.shipping > 0 && <Line label="Envío" value={cash(totals.shipping)} />}
        <Line label="Total" value={cash(totals.total)} strong />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button icon="share" label="Guardar y compartir PDF" loading={busy} onPress={() => submit(true)} />
      <Button variant="secondary" label="Guardar" disabled={busy} onPress={() => submit(false)} />
      {quote && (
        <Button
          variant="danger"
          label="Eliminar cotización"
          disabled={busy}
          onPress={() => confirmDelete(`Se eliminará la cotización ${quoteFolio(quote)}.`, () => save(() => supabase.from('quotes').delete().eq('id', quote.id)))}
        />
      )}
    </Screen>
  );
}
