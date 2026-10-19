import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, Field, Line, Row, Screen, Select } from '@/components/ui';
import { filamentName } from '@/lib/costs';
import { isIsoDay, isoDay, money, num, weight } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function FilamentPurchaseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { filaments, suppliers, expenses } = useData();
  const { busy, error, setError, save } = useSave();

  const [filamentId, setFilamentId] = useState<string | null>(id ?? null);
  const filament = filaments.find((item) => item.id === filamentId);
  const [grams, setGrams] = useState('1000');
  const [amount, setAmount] = useState('');
  // Undefined until the user picks one: by default the purchase goes to the filament's usual supplier.
  const [pickedSupplier, setPickedSupplier] = useState<string | null | undefined>(undefined);
  const supplierId = pickedSupplier === undefined ? (filament?.supplier_id ?? null) : pickedSupplier;
  const [date, setDate] = useState(isoDay());

  // Same rule as the database (expense_moves_filament): everything paid ÷ every gram bought.
  const before = expenses.reduce(
    (sum, expense) => (expense.filament_id === filamentId && expense.grams ? { paid: sum.paid + Number(expense.amount), grams: sum.grams + Number(expense.grams) } : sum),
    { paid: 0, grams: 0 },
  );
  const thisCost = num(grams) > 0 ? (num(amount) / num(grams)) * 1000 : 0;
  const newCost = before.grams + num(grams) > 0 ? ((before.paid + num(amount)) / (before.grams + num(grams))) * 1000 : 0;

  function submit() {
    if (!filament) return setError('Elige el filamento que compraste.');
    if (num(grams) <= 0) return setError('Indica cuántos gramos compraste.');
    if (!isIsoDay(date)) return setError('Escribe la fecha como AAAA-MM-DD.');
    save(() =>
      supabase.from('expenses').insert({
        category: 'filament',
        amount: num(amount),
        note: `Compra de ${filamentName(filament)}`,
        spent_at: date,
        supplier_id: supplierId,
        filament_id: filament.id,
        grams: num(grams),
      }),
    );
  }

  return (
    <Screen>
      <Select
        label="Filamento"
        value={filamentId}
        onChange={setFilamentId}
        options={filaments.map((item) => ({ value: item.id, label: filamentName(item), hint: `Quedan ${weight(item.stock_g)}` }))}
      />
      <Row>
        <Field style={{ flex: 1 }} label="Cantidad" unit="g" numeric value={grams} onChangeText={setGrams} />
        <Field style={{ flex: 1 }} label="Total pagado" unit="$" numeric value={amount} onChangeText={setAmount} placeholder="0" />
      </Row>
      <Select
        label="Proveedor"
        value={supplierId}
        onChange={setPickedSupplier}
        none="Sin proveedor"
        options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
      />
      <Field label="Fecha" value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" />

      {filament && (
        <Card>
          <Line label="Existencia después de la compra" value={weight(filament.stock_g + num(grams))} />
          <Line label="Esta compra" value={`${money(thisCost)} por kg`} />
          <Line
            label="Costo real por kg (tus compras)"
            value={`${before.grams > 0 ? money((before.paid / before.grams) * 1000) : 'sin compras'} → ${money(newCost)}`}
          />
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
      <Button label="Registrar compra" onPress={submit} loading={busy} />
    </Screen>
  );
}
