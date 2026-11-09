import { useState } from 'react';

import { Button, Card, Chips, ErrorText, Field, Heading, Muted } from '@/components/ui';
import { field, money, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

/** What a $100 price becomes with the resellers' % on top, so the workshop keeps the same. */
const example = (pct: number) => (pct > 0 && pct < 90 ? 100 / (1 - pct / 100) : 100);

/**
 * Resellers: a % added to the final price of every product, the same in every store or one per store.
 * Prices count it like one more commission, so the profit stays the same.
 */
export function ResellerSettings() {
  const { profile, channels } = useData();
  const { busy, error, setError, save } = useSave();
  const [general, setGeneral] = useState(field(profile?.reseller_pct));
  const [mode, setMode] = useState<'all' | 'store'>(profile?.reseller_by_channel ? 'store' : 'all');
  const [perChannel, setPerChannel] = useState<Record<string, string>>(() => Object.fromEntries(channels.map((channel) => [channel.id, field(channel.reseller_pct)])));
  const [done, setDone] = useState(false);
  if (!profile || profile.reseller_pct === undefined) return null;
  const byChannel = mode === 'store';

  function submit() {
    setDone(false);
    const values = byChannel ? channels.map((channel) => num(perChannel[channel.id] ?? '')) : [num(general)];
    if (values.some((pct) => !(pct >= 0 && pct < 90))) return setError('El % de revendedor va de 0 a 89.');
    save(
      async () => {
        const first = await supabase
          .from('profiles')
          .update({ reseller_pct: byChannel ? profile!.reseller_pct : num(general), reseller_by_channel: byChannel })
          .eq('id', profile!.id);
        if (first.error || !byChannel) return first;
        for (const channel of channels) {
          const result = await supabase.from('channels').update({ reseller_pct: num(perChannel[channel.id] ?? '') }).eq('id', channel.id);
          if (result.error) return result;
        }
        return first;
      },
      () => setDone(true),
    );
  }

  return (
    <Card>
      <Heading>Revendedores</Heading>
      <Muted>El % que le das a tus revendedores o afiliados. Se suma al precio final como una comisión más: cuando ellos venden y se llevan su parte, tú ganas lo mismo.</Muted>
      <Chips
        options={[
          { value: 'all', label: 'Igual en todas las tiendas' },
          { value: 'store', label: 'Distinto por tienda' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {!byChannel ? (
        <Field
          label="% para revendedores"
          unit="%"
          numeric
          value={general}
          onChangeText={setGeneral}
          placeholder="0"
          hint={num(general) > 0 ? `Ejemplo: un precio de ${money(100)} sube a ${money(example(num(general)))}.` : '0 = sin revendedores: los precios no cambian.'}
        />
      ) : channels.length ? (
        channels.map((channel) => (
          <Field
            key={channel.id}
            label={channel.name}
            unit="%"
            numeric
            value={perChannel[channel.id] ?? ''}
            onChangeText={(text) => setPerChannel({ ...perChannel, [channel.id]: text })}
            placeholder="0"
          />
        ))
      ) : (
        <Muted>Primero agrega tus tiendas en Canales de venta.</Muted>
      )}
      <ErrorText>{error}</ErrorText>
      <Button variant="secondary" label="Guardar revendedores" onPress={submit} loading={busy} />
      {done && <Muted>Guardado: los precios sugeridos ya lo incluyen.</Muted>}
    </Card>
  );
}
