import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, confirmDelete, ErrorText, Field, Screen } from '@/components/ui';
import { field, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function PostProcessFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { postProcesses } = useData();
  const { busy, error, setError, save } = useSave();
  const process = postProcesses.find((item) => item.id === id);

  const [name, setName] = useState(process?.name ?? '');
  const [perHour, setPerHour] = useState(field(process?.cost_per_hour));
  const [notes, setNotes] = useState(process?.notes ?? '');

  function submit() {
    if (!name.trim()) return setError('Ponle nombre al proceso.');
    if (!(num(perHour) >= 0)) return setError('El costo por hora debe ser un número.');
    const row = { name: name.trim(), cost_per_hour: num(perHour), notes: notes.trim() };
    save(() => (process ? supabase.from('post_processes').update(row).eq('id', process.id) : supabase.from('post_processes').insert(row)));
  }

  return (
    <Screen>
      <Field label="Proceso" value={name} onChangeText={setName} maxLength={120} placeholder="Lijado, pintado, pegado, armado…" />
      <Field
        label="Costo por hora"
        unit="$"
        numeric
        value={perHour}
        onChangeText={setPerHour}
        placeholder="100"
        hint="Lo que vale una hora de este trabajo: tu mano de obra y lo que gastas en él."
      />
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={300} placeholder="Lija 220 y 400, primer, barniz…" />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
      {process && (
        <Button
          variant="danger"
          icon="trash"
          label="Eliminar proceso"
          disabled={busy}
          onPress={() =>
            confirmDelete(`Se eliminará "${process.name}". Los productos que lo usan dejarán de sumar su costo.`, () =>
              save(() => supabase.from('post_processes').delete().eq('id', process.id)),
            )
          }
        />
      )}
    </Screen>
  );
}
