import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Empty, ErrorText, Field, ListItem, Muted, Row, Screen } from '@/components/ui';
import { taxLabel } from '@/lib/clients';
import { getWorkshopCurrency } from '@/lib/format';
import { useData } from '@/store/data';

export default function ClientsScreen() {
  const { clients, quotes, profile, shop } = useData();
  const [query, setQuery] = useState('');
  const label = taxLabel(profile?.client_fields, getWorkshopCurrency());
  const missingSchema = profile && profile.client_fields === undefined;
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? clients.filter((client) => [client.name, client.legal_name, client.tax_id, client.phone, client.email, client.city].some((text) => text.toLowerCase().includes(needle)))
    : clients;

  return (
    <Screen>
      <Row>
        {shop?.role === 'owner' && <Button style={{ flex: 1 }} variant="secondary" icon="options" label="Campos" onPress={() => router.push('/clientes/campos')} />}
        <Button style={{ flex: 1 }} icon="person-add" label="Nuevo cliente" disabled={!!missingSchema} onPress={() => router.push('/clientes/form')} />
      </Row>
      {missingSchema && <ErrorText>Falta actualizar la base de datos (supabase/schema.sql) para guardar clientes.</ErrorText>}
      <Muted>Tus clientes con sus datos de contacto y de facturación. Los campos de facturación los defines tú, según lo que pida tu país.</Muted>
      {clients.length > 5 && <Field label="Buscar" value={query} onChangeText={setQuery} placeholder="Nombre, teléfono, correo o ID fiscal" />}
      {clients.length === 0 ? (
        <Empty icon="people" text="Aquí aparecen tus clientes. Dalos de alta aquí o desde una cotización." />
      ) : (
        shown.map((client) => {
          const count = quotes.filter((quote) => quote.client_id === client.id).length;
          return (
            <ListItem
              key={client.id}
              title={client.name}
              subtitle={[client.tax_id && `${label}: ${client.tax_id}`, client.phone, client.city].filter(Boolean).join(' · ')}
              value={count ? String(count) : undefined}
              valueHint={count ? (count === 1 ? 'cotización' : 'cotizaciones') : undefined}
              onPress={() => router.push({ pathname: '/clientes/form', params: { id: client.id } })}
            />
          );
        })
      )}
    </Screen>
  );
}
