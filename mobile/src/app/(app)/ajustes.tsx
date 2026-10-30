import { useState } from 'react';

import { Button, Chips, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { CURRENCIES, type Currency } from '@/lib/currency';
import { field, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function SettingsScreen() {
  const { profile } = useData();
  const { busy, error, setError, save } = useSave();

  const [name, setName] = useState(profile?.name ?? '');
  const [businessName, setBusinessName] = useState(profile?.business_name ?? '');
  const [kwhPrice, setKwhPrice] = useState(field(profile?.kwh_price));
  const [currency, setCurrency] = useState<Currency>(profile?.currency ?? 'MXN');
  const [margin, setMargin] = useState(String(profile?.margin_pct ?? 50));

  function submit() {
    if (!(num(margin) >= 0 && num(margin) < 95)) return setError('La ganancia sobre la venta va de 0% a 94%.');
    save(() =>
      supabase
        .from('profiles')
        .update({ name: name.trim(), business_name: businessName.trim(), kwh_price: num(kwhPrice), margin_pct: num(margin), currency })
        .eq('id', profile!.id),
    );
  }

  return (
    <Screen>
      <Field label="Tu nombre" value={name} onChangeText={setName} maxLength={40} />
      <Field label="Nombre del negocio" value={businessName} onChangeText={setBusinessName} maxLength={60} />
      <Chips label="Moneda" options={CURRENCIES.map((item) => ({ value: item.code, label: item.code }))} value={currency} onChange={setCurrency} />
      <Muted>Tus costos y precios se escriben y se muestran en ella. Cambiarla no convierte lo que ya escribiste.</Muted>
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
