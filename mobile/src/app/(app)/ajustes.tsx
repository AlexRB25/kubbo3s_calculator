import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Chips, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { CURRENCIES, loadRates, type Currency } from '@/lib/currency';
import { levelPrices, priceLevels } from '@/lib/costs';
import { field, money, moneyIn, num } from '@/lib/format';
import { draftOf, marginOnPrice, readLevels } from '@/lib/levels';
import type { Channel } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function SettingsScreen() {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();

  const [name, setName] = useState(profile?.name ?? '');
  const [businessName, setBusinessName] = useState(profile?.business_name ?? '');
  const [kwhPrice, setKwhPrice] = useState(field(profile?.kwh_price));
  const [levels, setLevels] = useState(() => draftOf(priceLevels(profile)));
  const typed = readLevels(levels);
  // A piece that costs 100 in a channel without commission: what each level charges.
  const example = 'levels' in typed ? levelPrices(100, { commission_pct: 0, tax_pct: 0, fixed_fee: 0 } as Channel, typed.levels) : null;

  function submit() {
    if ('error' in typed) return setError(typed.error);
    save(() =>
      supabase
        .from('profiles')
        .update({
          name: name.trim(),
          business_name: businessName.trim(),
          kwh_price: num(kwhPrice),
          price_levels: typed.levels,
          margin_pct: marginOnPrice(typed.levels.normal),
        })
        .eq('id', profile!.id),
    );
  }

  const currency = profile?.currency ?? 'MXN';

  // Changing the currency asks whether to convert every amount already written at today's rate.
  async function chooseCurrency(next: Currency) {
    if (next === currency) return;
    const rates = await loadRates();
    const factor = rates[next] / rates[currency];
    const change = (convert: boolean) =>
      save(
        () => supabase.rpc('change_currency', { p_from: currency, p_to: next, p_factor: convert ? factor : null }),
        // The amounts on this screen were converted too.
        () => setKwhPrice(field(convert ? Math.round(num(kwhPrice) * factor * 10000) / 10000 : num(kwhPrice))),
      );
    Alert.alert(
      `Cambiar a ${next}`,
      `Tipo de cambio de hoy: 1 ${currency} = ${moneyIn(factor, next, 4)} ${next} (${moneyIn(250, currency)} → ${moneyIn(250 * factor, next)}).

¿Convertimos lo que ya escribiste? Precios, costos, compras, gastos, luz, impresoras, embalaje, paqueterías y ventas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Solo cambiar la moneda', onPress: () => change(false) },
        { text: 'Convertir todo', onPress: () => change(true) },
      ],
    );
  }

  return (
    <Screen>
      <Field label="Tu nombre" value={name} onChangeText={setName} maxLength={40} />
      <Field label="Nombre del negocio" value={businessName} onChangeText={setBusinessName} maxLength={60} />
      <Chips label="Moneda" options={CURRENCIES.map((item) => ({ value: item.code, label: item.code }))} value={currency} onChange={chooseCurrency} />
      <Muted>Tus costos y precios se escriben y se muestran en ella. Al cambiarla te preguntamos si convertimos lo que ya escribiste.</Muted>
      {profile && profile.number_format !== undefined && (
        <>
          <Chips
            label="Miles y decimales"
            options={[
              { value: 'auto', label: 'Según mi moneda' },
              { value: 'dot', label: '1,234.56' },
              { value: 'comma', label: '1.234,56' },
            ]}
            value={profile.number_format?.decimals ?? 'auto'}
            onChange={(decimals) =>
              save(() => supabase.from('profiles').update({ number_format: { ...profile.number_format, decimals } }).eq('id', profile.id), () => {})
            }
          />
          <Chips
            label="Mostrar la moneda como"
            options={[
              { value: 'symbol', label: 'Símbolo ($15.00)' },
              { value: 'code', label: `Con código ($15.00 ${currency})` },
            ]}
            value={profile.number_format?.code ? 'code' : 'symbol'}
            onChange={(choice) =>
              save(() => supabase.from('profiles').update({ number_format: { ...profile.number_format, code: choice === 'code' } }).eq('id', profile.id), () => {})
            }
          />
        </>
      )}
      <Field
        label="Precio de la luz por kWh"
        unit="$"
        numeric
        value={kwhPrice}
        onChangeText={setKwhPrice}
        placeholder="0"
        hint="Viene en tu recibo. Con el consumo de cada impresora suma la electricidad al costo de las piezas."
      />
      <Muted>
        Ganancia sobre lo que te cuesta hacer la pieza: 100% = ganas lo mismo que te cuesta. Descuento y mayoreo son tu límite para bajar. Valen para todos los productos;
        uno puede tener los suyos al editarlo.
      </Muted>
      <Field label="Ganancia normal" unit="%" numeric value={levels.normal} onChangeText={(text) => setLevels({ ...levels, normal: text })} hint="Tu precio de siempre." />
      <Field label="Con descuento" unit="%" numeric value={levels.discount} onChangeText={(text) => setLevels({ ...levels, discount: text })} hint="Lo más que bajas en una oferta." />
      <Field label="Mayoreo" unit="%" numeric value={levels.wholesale} onChangeText={(text) => setLevels({ ...levels, wholesale: text })} hint="Lo más que bajas por volumen." />
      <Field label="Mayoreo desde" unit="pzs" numeric value={levels.wholesale_min} onChangeText={(text) => setLevels({ ...levels, wholesale_min: text })} />
      <Field
        label="Margen extra para descontar"
        unit="%"
        numeric
        value={levels.list_extra}
        onChangeText={(text) => setLevels({ ...levels, list_extra: text })}
        hint="Se suma al precio normal para publicar; así al descontar sigues ganando lo normal. 0 = sin extra."
      />
      {example && 'levels' in typed && (
        <Muted>
          {`Pieza que cuesta ${money(100)}, sin comisión:${typed.levels.list_extra > 0 ? ` lista ${money(example.list)},` : ''} normal ${money(example.normal)} (ganas ${money(example.normal - 100)}, ${example.normal > 0 ? Math.round(((example.normal - 100) / example.normal) * 100) : 0}% de la venta), descuento ${money(example.discount)}, mayoreo ${money(example.wholesale)}. En cada producto ves estos precios ya con comisión y envío.`}
        </Muted>
      )}

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
    </Screen>
  );
}
