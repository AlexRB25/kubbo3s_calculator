import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, confirmDelete, ErrorText, Field, Row, Screen } from '@/components/ui';
import { field, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function PrinterFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { printers } = useData();
  const { busy, error, setError, save } = useSave();
  const printer = printers.find((item) => item.id === id);

  const [name, setName] = useState(printer?.name ?? '');
  const [model, setModel] = useState(printer?.model ?? '');
  const [watts, setWatts] = useState(field(printer?.power_watts));
  const [hourlyCost, setHourlyCost] = useState(field(printer?.hourly_cost));
  const [notes, setNotes] = useState(printer?.notes ?? '');

  function submit() {
    if (!name.trim()) return setError('Ponle nombre a la impresora.');
    const row = {
      name: name.trim(),
      model: model.trim(),
      power_watts: num(watts),
      hourly_cost: num(hourlyCost),
      notes: notes.trim(),
    };
    save(() => (printer ? supabase.from('printers').update(row).eq('id', printer.id) : supabase.from('printers').insert(row)));
  }

  return (
    <Screen>
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Bambu 1" maxLength={40} />
      <Field label="Marca y modelo" value={model} onChangeText={setModel} placeholder="Bambu Lab A1" maxLength={60} />
      <Row style={{ alignItems: 'flex-start' }}>
        <Field
          style={{ flex: 1 }}
          label="Consumo"
          unit="watts"
          numeric
          value={watts}
          onChangeText={setWatts}
          placeholder="0"
          hint="Promedio mientras imprime."
        />
        <Field
          style={{ flex: 1 }}
          label="Desgaste por hora"
          unit="$"
          numeric
          value={hourlyCost}
          onChangeText={setHourlyCost}
          placeholder="0"
          hint="Precio de la máquina ÷ horas de vida útil."
        />
      </Row>
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={300} />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
      {printer && (
        <Button
          variant="danger"
          icon="trash"
          label="Eliminar impresora"
          disabled={busy}
          onPress={() =>
            confirmDelete(`Se eliminará "${printer.name}" junto con su historial de mantenimientos y ajustes.`, () =>
              save(
                () => supabase.from('printers').delete().eq('id', printer.id),
                () => router.dismissTo('/impresoras'),
              ),
            )
          }
        />
      )}
    </Screen>
  );
}
