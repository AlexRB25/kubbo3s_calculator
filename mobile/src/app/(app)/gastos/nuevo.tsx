import { useState } from 'react';

import { Button, Chips, ErrorText, Field, Muted, Row, Screen, Select } from '@/components/ui';
import { isIsoDay, isoDay, num } from '@/lib/format';
import { EXPENSE_CATEGORIES } from '@/lib/labels';
import { supabase } from '@/lib/supabase';
import type { ExpenseCategory } from '@/lib/types';
import { useData, useSave } from '@/store/data';

export default function NewExpenseScreen() {
  const { suppliers, printers } = useData();
  const { busy, error, setError, save } = useSave();

  const [category, setCategory] = useState<ExpenseCategory>('parts');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(isoDay());
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [printerId, setPrinterId] = useState<string | null>(null);

  function submit() {
    if (num(amount) <= 0) return setError('Indica cuánto gastaste.');
    if (!isIsoDay(date)) return setError('Escribe la fecha como AAAA-MM-DD.');
    save(() =>
      supabase.from('expenses').insert({
        category,
        amount: num(amount),
        note: note.trim(),
        spent_at: date,
        supplier_id: supplierId,
        printer_id: printerId,
      }),
    );
  }

  return (
    <Screen>
      <Chips label="Categoría" options={EXPENSE_CATEGORIES} value={category} onChange={setCategory} />
      <Muted>El filamento se registra como compra (suma gramos a tu inventario) y los mantenimientos desde la impresora.</Muted>
      <Row>
        <Field style={{ flex: 1 }} label="Monto" unit="$" numeric value={amount} onChangeText={setAmount} placeholder="0" />
        <Field style={{ flex: 1 }} label="Fecha" value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" />
      </Row>
      <Field label="Concepto" value={note} onChangeText={setNote} placeholder="Boquillas, cajas, recibo de luz…" maxLength={120} />
      <Select
        label="Proveedor"
        value={supplierId}
        onChange={setSupplierId}
        none="Sin proveedor"
        options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
      />
      <Select
        label="Impresora"
        value={printerId}
        onChange={setPrinterId}
        none="Ninguna en particular"
        options={printers.map((printer) => ({ value: printer.id, label: printer.name }))}
      />

      <ErrorText>{error}</ErrorText>
      <Button label="Registrar gasto" onPress={submit} loading={busy} />
    </Screen>
  );
}
