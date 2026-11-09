import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, confirmDelete, ErrorText, Field, Heading, Muted, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
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
  const [affiliates, setAffiliates] = useState(() => (channel?.affiliates ?? []).map((affiliate) => ({ name: affiliate.name, pct: String(affiliate.pct) })));
  const setAffiliate = (index: number, change: Partial<{ name: string; pct: string }>) =>
    setAffiliates(affiliates.map((affiliate, position) => (position === index ? { ...affiliate, ...change } : affiliate)));

  function submit() {
    if (!name.trim()) return setError('Ponle nombre al canal.');
    if (num(commission) < 0 || num(commission) >= 100) return setError('La comisión debe estar entre 0 y 99%.');
    if (num(tax) < 0 || num(commission) + num(tax) >= 100) return setError('Comisión más impuestos deben sumar menos de 100%.');
    const saved = affiliates
      .filter((affiliate) => num(affiliate.pct) > 0)
      .map((affiliate, index) => ({ name: affiliate.name.trim() || `Revendedor ${index + 1}`, pct: num(affiliate.pct) }));
    const highest = Math.max(0, ...saved.map((affiliate) => affiliate.pct));
    if (num(commission) + num(tax) + highest >= 95) return setError('Comisión, impuestos y el % del revendedor deben sumar menos de 95%.');
    const row = {
      name: name.trim(),
      affiliates: saved,
      commission_pct: num(commission),
      // A list of taxes made on the web keeps its total.
      ...(channel?.taxes?.length ? {} : { tax_pct: num(tax) }),
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
      {channel?.taxes?.length ? (
        <Muted>
          {`Impuestos: ${channel.taxes.map((tax) => `${tax.name} ${tax.pct}%${tax.net ? ' (sin IVA)' : ''}`).join(' + ')} = ${Number(channel.tax_pct).toFixed(2)}% del precio. Se editan desde la web.`}
        </Muted>
      ) : (
      <Field
        label="Impuestos"
        unit="%"
        numeric
        value={tax}
        onChangeText={setTax}
        placeholder="0"
        hint="Retenciones de IVA e ISR de la plataforma o los que pagas tú. Se descuentan como la comisión."
      />
      )}
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

      <Card>
        <Heading>Revendedores y afiliados</Heading>
        <Muted>Quienes venden en este canal y se llevan un % del precio (afiliados de TikTok, revendedores). Tus productos te muestran el precio con su % sumado para que ganes lo mismo.</Muted>
        {affiliates.map((affiliate, index) => (
          <View key={index} style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' }}>
            <Field style={{ flex: 1 }} label="Nombre" value={affiliate.name} onChangeText={(value) => setAffiliate(index, { name: value })} placeholder="Afiliado Juan" maxLength={40} />
            <Field style={{ width: 90 }} label="%" numeric value={affiliate.pct} onChangeText={(value) => setAffiliate(index, { pct: value })} placeholder="10" />
            <Pressable hitSlop={8} style={{ paddingBottom: 14 }} onPress={() => setAffiliates(affiliates.filter((_, position) => position !== index))}>
              <Text style={{ color: Colors.danger, fontSize: 18, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Button variant="secondary" icon="person-add" label="Agregar revendedor" onPress={() => setAffiliates([...affiliates, { name: '', pct: '' }])} />
      </Card>

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
