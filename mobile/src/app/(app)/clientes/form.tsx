import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, confirmDelete, ErrorText, Field, Heading, Muted, Screen } from '@/components/ui';
import { blankClient, taxLabel } from '@/lib/clients';
import { setPickedClient } from '@/lib/quote-share';
import { supabase } from '@/lib/supabase';
import type { Client } from '@/lib/types';
import { useData, useSave } from '@/store/data';

/** Add or edit a client. With `pick=1` (from a quote) the new client is handed back to that quote. */
export default function ClientFormScreen() {
  const { id, pick } = useLocalSearchParams<{ id?: string; pick?: string }>();
  const { clients, profile } = useData();
  const { busy, error, setError, save } = useSave();
  const client = clients.find((item) => item.id === id) ?? null;
  const settings = profile?.client_fields ?? {};
  const fields = settings.fields ?? [];
  const [values, setValues] = useState(() => ({ ...blankClient(), ...(client ?? {}) }));
  const set = (patch: Partial<typeof values>) => setValues((current) => ({ ...current, ...patch }));

  function submit() {
    if (!values.name.trim()) return setError('Escribe el nombre del cliente.');
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
      extra: Object.fromEntries(fields.map((field) => [field.id, (values.extra?.[field.id] ?? '').trim()]).filter(([, value]) => value)),
    };
    save(async () => {
      const result = client
        ? await supabase.from('clients').update(row).eq('id', client.id).select().single()
        : await supabase.from('clients').insert(row).select().single();
      if (!result.error && pick) setPickedClient(result.data as Client);
      return result;
    });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: client ? client.name : 'Nuevo cliente' }} />
      <Card>
        <Heading>Contacto</Heading>
        <Field label="Nombre o empresa *" value={values.name} onChangeText={(name) => set({ name })} />
        <Field label="WhatsApp o teléfono" value={values.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" />
        <Field label="Correo" value={values.email} onChangeText={(email) => set({ email })} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Ciudad" value={values.city} onChangeText={(city) => set({ city })} />
        <Field label="Dirección" value={values.address} onChangeText={(address) => set({ address })} />
      </Card>
      <Card>
        <Heading>Facturación</Heading>
        <Field label="Nombre fiscal o razón social" value={values.legal_name} onChangeText={(legal_name) => set({ legal_name })} />
        <Field label={taxLabel(settings, profile?.currency ?? 'MXN')} value={values.tax_id} onChangeText={(tax_id) => set({ tax_id })} autoCapitalize="characters" />
        {fields.map((field) => (
          <Field
            key={field.id}
            label={field.label}
            value={values.extra?.[field.id] ?? ''}
            onChangeText={(text) => set({ extra: { ...values.extra, [field.id]: text } })}
          />
        ))}
        {fields.length === 0 && <Muted>¿Tus facturas piden más datos? Agrégalos en Clientes → Campos.</Muted>}
      </Card>
      <Field label="Notas" value={values.notes} onChangeText={(notes) => set({ notes })} multiline />
      <ErrorText>{error}</ErrorText>
      <Button label={client ? 'Guardar' : 'Dar de alta'} loading={busy} onPress={submit} />
      {client && (
        <Button
          variant="danger"
          label="Eliminar cliente"
          disabled={busy}
          onPress={() => confirmDelete(`Se eliminará ${client.name}. Sus cotizaciones se conservan.`, () => save(() => supabase.from('clients').delete().eq('id', client.id)))}
        />
      )}
      {pick && !client ? <Muted>Al guardarlo queda elegido en tu cotización.</Muted> : null}
    </Screen>
  );
}
