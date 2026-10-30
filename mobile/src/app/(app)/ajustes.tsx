import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Chips, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { CURRENCIES, loadRates, type Currency } from '@/lib/currency';
import { field, moneyIn, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function SettingsScreen() {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();

  const [name, setName] = useState(profile?.name ?? '');
  const [businessName, setBusinessName] = useState(profile?.business_name ?? '');
  const [kwhPrice, setKwhPrice] = useState(field(profile?.kwh_price));
  const [margin, setMargin] = useState(String(profile?.margin_pct ?? 50));

  function submit() {
    if (!(num(margin) >= 0 && num(margin) < 95)) return setError('La ganancia sobre la venta va de 0% a 94%.');
    save(() =>
      supabase
        .from('profiles')
        .update({ name: name.trim(), business_name: businessName.trim(), kwh_price: num(kwhPrice), margin_pct: num(margin) })
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
      <Field
        label="Precio de la luz por kWh"
        unit="$"
        numeric
        value={kwhPrice}
        onChangeText={setKwhPrice}
        placeholder="0"
        hint="Viene en tu recibo. Con el consumo de cada impresora suma la electricidad al costo de las piezas."
      />
      <Field
        label="Ganancia deseada sobre la venta"
        unit="%"
        numeric
        value={margin}
        onChangeText={setMargin}
        hint="Lo que te queda del precio de venta ya pagados producción, comisiones e impuestos (el envío aparte). Vendes en $100, te cuesta $50: ganas 50%."
      />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
    </Screen>
  );
}
