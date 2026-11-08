import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Chips, Empty, ErrorText, ListItem, Muted, Row, Screen } from '@/components/ui';
import { type Currency } from '@/lib/currency';
import { day, moneyIn } from '@/lib/format';
import { QUOTE_STATUS, quoteFolio, quoteTotals } from '@/lib/quotes';
import type { Quote } from '@/lib/types';
import { useData } from '@/store/data';

const TONE: Record<Quote['status'], 'warn' | 'good' | 'bad'> = { pending: 'warn', accepted: 'good', rejected: 'bad' };

export default function QuotesScreen() {
  const { quotes, profile } = useData();
  const [filter, setFilter] = useState<Quote['status'] | 'all'>('all');
  const shown = filter === 'all' ? quotes : quotes.filter((quote) => quote.status === filter);
  const missingSchema = profile && profile.quote_settings === undefined;

  return (
    <Screen>
      <Row>
        <Button style={{ flex: 1 }} variant="secondary" icon="calculator" label="Cálculo rápido" onPress={() => router.push('/calculadora')} />
        <Button style={{ flex: 1 }} icon="add" label="Nueva" disabled={!!missingSchema} onPress={() => router.push('/cotizaciones/form')} />
      </Row>
      {missingSchema && <ErrorText>Falta actualizar la base de datos (supabase/schema.sql) para guardar cotizaciones.</ErrorText>}
      {quotes.length > 0 && (
        <Chips
          options={[
            { value: 'all', label: `Todas (${quotes.length})` },
            ...(['pending', 'accepted', 'rejected'] as const).map((value) => ({
              value,
              label: `${QUOTE_STATUS[value]} (${quotes.filter((quote) => quote.status === value).length})`,
            })),
          ]}
          value={filter}
          onChange={setFilter}
        />
      )}
      {quotes.length === 0 ? (
        <Empty icon="document-text" text="Aquí aparecen las cotizaciones que hagas para tus clientes. Empieza con el cálculo rápido o con una nueva." />
      ) : (
        shown.map((quote) => (
          <ListItem
            key={quote.id}
            title={`${quoteFolio(quote)} · ${quote.client_name || 'Sin cliente'}`}
            subtitle={day(quote.created_at)}
            value={moneyIn(quoteTotals(quote).total, quote.currency as Currency)}
            valueHint={QUOTE_STATUS[quote.status]}
            tone={TONE[quote.status]}
            onPress={() => router.push({ pathname: '/cotizaciones/form', params: { id: quote.id } })}
          />
        ))
      )}
      <Muted>Tu logo, teléfono y condiciones de pago se configuran en Ajustes.</Muted>
    </Screen>
  );
}
