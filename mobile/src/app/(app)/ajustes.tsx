import { useState } from 'react';

import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { field, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function SettingsScreen() {
  const { profile } = useData();
  const { busy, error, save } = useSave();

  const [name, setName] = useState(profile?.name ?? '');
  const [businessName, setBusinessName] = useState(profile?.business_name ?? '');
  const [kwhPrice, setKwhPrice] = useState(field(profile?.kwh_price));
  const [margin, setMargin] = useState(String(profile?.margin_pct ?? 100));

  function submit() {
    save(() =>
      supabase
        .from('profiles')
        .update({ name: name.trim(), business_name: businessName.trim(), kwh_price: num(kwhPrice), margin_pct: num(margin) })
        .eq('id', profile!.id),
    );
  }

  return (
    <Screen>
      <Field label="Tu nombre" value={name} onChangeText={setName} maxLength={40} />
      <Field label="Nombre del negocio" value={businessName} onChangeText={setBusinessName} maxLength={60} />
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
        label="Ganancia deseada sobre el costo"
        unit="%"
        numeric
        value={margin}
        onChangeText={setMargin}
        hint="Con 100%, el precio sugerido te deja de ganancia lo mismo que costó producir la pieza, ya pagadas comisión y envío."
      />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
    </Screen>
  );
}
