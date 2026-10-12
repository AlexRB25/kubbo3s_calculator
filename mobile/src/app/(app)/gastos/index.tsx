import { router } from 'expo-router';

import { Button, confirmDelete, Empty, ErrorText, ListItem, Muted, Row, Screen } from '@/components/ui';
import { day, money, weight } from '@/lib/format';
import { EXPENSE_LABELS } from '@/lib/labels';
import { supabase } from '@/lib/supabase';
import type { Expense } from '@/lib/types';
import { useData, useSave } from '@/store/data';

export default function ExpensesScreen() {
  const { expenses, suppliers } = useData();
  const { error, save } = useSave();

  function remove(expense: Expense) {
    // The maintenance record owns its expense; deleting it there removes both.
    if (expense.maintenance_id) {
      return confirmDelete('Este gasto viene de un mantenimiento. Se eliminará también del historial de la impresora.', () =>
        save(() => supabase.from('maintenance').delete().eq('id', expense.maintenance_id!), () => {}),
      );
    }
    confirmDelete(expense.grams ? `Se descontarán ${weight(expense.grams)} de ese filamento.` : 'Se eliminará este gasto.', () =>
      save(() => supabase.from('expenses').delete().eq('id', expense.id), () => {}),
    );
  }

  return (
    <Screen>
      <Row>
        <Button style={{ flex: 1 }} icon="add" label="Nuevo gasto" onPress={() => router.push('/gastos/nuevo')} />
        <Button style={{ flex: 1 }} variant="secondary" icon="cart" label="Compra de filamento" onPress={() => router.push('/filamento/compra')} />
      </Row>
      <ErrorText>{error}</ErrorText>
      {expenses.length === 0 ? (
        <Empty icon="receipt-outline" text="Aquí aparecen tus compras de filamento, mantenimientos y cualquier otro gasto que registres." />
      ) : (
        <Muted>Mantén presionado un gasto para eliminarlo.</Muted>
      )}
      {expenses.map((expense) => {
        const supplier = suppliers.find((item) => item.id === expense.supplier_id)?.name;
        return (
          <ListItem
            key={expense.id}
            title={expense.note || EXPENSE_LABELS[expense.category]}
            subtitle={[EXPENSE_LABELS[expense.category], supplier, day(expense.spent_at)].filter(Boolean).join(' · ')}
            value={money(expense.amount)}
            onLongPress={() => remove(expense)}
          />
        );
      })}
    </Screen>
  );
}
