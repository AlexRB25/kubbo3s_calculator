import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Chips, ErrorText, Field, Row, Screen, Select } from '@/components/ui';
import { isIsoDay, isoDay, num } from '@/lib/format';
import { MAINTENANCE_KINDS } from '@/lib/labels';
import { supabase } from '@/lib/supabase';
import type { MaintenanceKind } from '@/lib/types';
import { useData, useSave } from '@/store/data';

export default function MaintenanceFormScreen() {
  const { impresora } = useLocalSearchParams<{ impresora?: string }>();
  const { printers } = useData();
  const { busy, error, setError, save } = useSave();

  const [printerId, setPrinterId] = useState<string | null>(impresora ?? null);
  const [kind, setKind] = useState<MaintenanceKind>('maintenance');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(isoDay());
  const [nextDue, setNextDue] = useState('');

  function submit() {
    if (!printerId) return setError('Elige la impresora.');
    if (!title.trim()) return setError('Describe qué se le hizo.');
    if (!isIsoDay(date)) return setError('Escribe la fecha como AAAA-MM-DD.');
    if (nextDue && !isIsoDay(nextDue)) return setError('Escribe la fecha del próximo mantenimiento como AAAA-MM-DD, o déjala vacía.');
    save(() =>
      supabase.from('maintenance').insert({
        printer_id: printerId,
        kind,
        title: title.trim(),
        notes: notes.trim(),
        cost: num(cost),
        performed_at: date,
        next_due: nextDue || null,
      }),
    );
  }

  return (
    <Screen>
      <Select
        label="Impresora"
        value={printerId}
        onChange={setPrinterId}
        options={printers.map((printer) => ({ value: printer.id, label: printer.name }))}
      />
      <Chips label="Tipo" options={MAINTENANCE_KINDS} value={kind} onChange={setKind} />
      <Field label="¿Qué se hizo?" value={title} onChangeText={setTitle} placeholder="Cambio de boquilla 0.4" maxLength={80} />
      <Field
        label="Detalles"
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={500}
        placeholder="Valores antes y después, piezas cambiadas…"
      />
      <Row style={{ alignItems: 'flex-start' }}>
        <Field
          style={{ flex: 1 }}
          label="Costo"
          unit="$"
          numeric
          value={cost}
          onChangeText={setCost}
          placeholder="0"
          hint="Si pones costo, también queda como gasto."
        />
        <Field style={{ flex: 1 }} label="Fecha" value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" />
      </Row>
      <Field
        label="Próximo mantenimiento (opcional)"
        value={nextDue}
        onChangeText={setNextDue}
        placeholder="AAAA-MM-DD"
        keyboardType="numbers-and-punctuation"
        hint="Te lo recordamos en Inicio una semana antes."
      />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
    </Screen>
  );
}
