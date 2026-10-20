import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, confirmDelete, ErrorText, Field, Screen } from '@/components/ui';
import { field, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function ChannelFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { channels } = useData();
  const { busy, error, setError, save } = useSave();
  const channel = channels.find((item) => item.id === id);

  const [name, setName] = useState(channel?.name ?? '');
  const [commission, setCommission] = useState(field(channel?.commission_pct));
  const [tax, setTax] = useState(field(channel?.tax_pct));
  const [fixedFee, setFixedFee] = useState(field(channel?.fixed_fee));
  const [shipping, setShipping] = useState(field(channel?.shipping_cost));

  function submit() {
    if (!name.trim()) return setError('Ponle nombre al canal.');
    if (num(commission) < 0 || num(commission) >= 100) return setError('La comisión debe estar entre 0 y 99%.');
    if (num(tax) < 0 || num(commission) + num(tax) >= 100) return setError('Comisión más impuestos deben sumar menos de 100%.');
    const row = {
      name: name.trim(),
      commission_pct: num(commission),
      tax_pct: num(tax),
      fixed_fee: num(fixedFee),
      shipping_cost: num(shipping),
      ...(channel ? {} : { sort: channels.length + 1 }),
    };
    save(() => (channel ? supabase.from('channels').update(row).eq('id', channel.id) : supabase.from('channels').insert(row)));
  }

  return (
    <Screen>
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Mercado Libre" maxLength={40} />
      <Field
        label="Comisión"
        unit="%"
        numeric
        value={commission}
        onChangeText={setCommission}
        placeholder="0"
        hint="Porcentaje del precio que se queda la plataforma."
      />
      <Field
        label="Impuestos"
        unit="%"
        numeric
        value={tax}
        onChangeText={setTax}
        placeholder="0"
        hint="Retenciones de IVA e ISR de la plataforma o los que pagas tú. Se descuentan como la comisión."
      />
      <Field
        label="Cargo fijo por pieza"
        unit="$"
        numeric
        value={fixedFee}
        onChangeText={setFixedFee}
        placeholder="0"
        hint="Por ejemplo, el costo fijo por unidad en publicaciones de precio bajo."
      />
      <Field
        label="Envío que pagas por venta"
        unit="$"
        numeric
        value={shipping}
        onChangeText={setShipping}
        placeholder="0"
        hint="Déjalo en 0 si el comprador paga el envío."
      />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
      {channel && (
        <Button
          variant="danger"
          icon="trash"
          label="Eliminar canal"
          disabled={busy}
          onPress={() =>
            confirmDelete(`Se eliminará "${channel.name}". Las ventas ya registradas conservan su nombre.`, () =>
              save(() => supabase.from('channels').delete().eq('id', channel.id)),
            )
          }
        />
      )}
    </Screen>
  );
}
