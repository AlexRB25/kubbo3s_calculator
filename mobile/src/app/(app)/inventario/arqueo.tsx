import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Chips, ErrorText, Field, Line, Muted, Screen } from '@/components/ui';
import { costPerGram, filamentName } from '@/lib/costs';
import { isIsoDay, isoDay, money, num, weight } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

const REASONS = ['Merma', 'Impresión fallida', 'Conteo físico', 'Muestra o regalo', 'Se dañó'] as const;

/**
 * Arqueo: the user types what there physically is and the difference goes in or out, with its
 * reason, as a movement of the history. It is not a purchase nor an expense.
 */
export default function CountScreen() {
  const { type, id } = useLocalSearchParams<{ type: 'filament' | 'product'; id: string }>();
  const { filaments, products } = useData();
  const { busy, error, setError, save } = useSave();
  const filament = type === 'filament' ? filaments.find((item) => item.id === id) : undefined;
  const product = type === 'product' ? products.find((item) => item.id === id) : undefined;
  const stock = filament?.stock_g ?? product?.stock ?? 0;
  const show = (value: number) => (filament ? weight(value) : `${value} pzas`);

  const [counted, setCounted] = useState(String(Math.max(0, Math.round(stock * 1000) / 1000)));
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(isoDay());
  const delta = num(counted) - stock;

  if (!filament && !product) return <Screen><Muted>No se encontró lo que quieres arquear.</Muted></Screen>;

  function submit() {
    if (num(counted) < 0) return setError('Lo que hay físicamente no puede ser negativo.');
    if (product && !Number.isInteger(num(counted))) return setError('Los productos se cuentan en piezas enteras.');
    if (Math.abs(delta) < 1e-6) return setError('Lo que hay es igual a lo registrado: no hay nada que arquear.');
    if (!reason.trim()) return setError('Indica el motivo para que quede en el historial.');
    if (!isIsoDay(date)) return setError('Escribe la fecha como AAAA-MM-DD.');
    save(() => supabase.from('inventory_adjustments').insert({ item_type: type, item_id: id, delta, note: reason.trim(), moved_at: date }));
  }

  return (
    <Screen>
      <Card>
        <Line label={filament ? filamentName(filament) : product!.name} value={`Registrado: ${show(stock)}`} strong />
      </Card>
      <Field label={filament ? 'Lo que tienes físicamente (g)' : 'Piezas que tienes físicamente'} numeric value={counted} onChangeText={setCounted} />
      {Math.abs(delta) > 1e-6 && (
        <Card>
          <Line label={delta < 0 ? 'Se restan' : 'Se suman'} value={show(Math.abs(delta))} />
          {filament && <Line label="A costo" value={money(Math.abs(delta) * costPerGram(filament))} />}
          <Line label="Quedan" value={show(num(counted))} strong />
        </Card>
      )}
      <Chips label="Motivo" options={REASONS.map((value) => ({ value, label: value }))} value={reason as (typeof REASONS)[number]} onChange={setReason} />
      <Field label="Otro motivo" value={reason} onChangeText={setReason} placeholder="Escribe el motivo" />
      <Field label="Fecha" value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" />
      <Muted>No es una compra ni un gasto: queda en el historial de movimientos.</Muted>
      <ErrorText>{error}</ErrorText>
      <Button label="Guardar arqueo" onPress={submit} loading={busy} />
    </Screen>
  );
}
