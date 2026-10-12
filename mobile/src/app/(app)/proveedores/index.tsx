import { router } from 'expo-router';

import { Button, Empty, ListItem, Screen } from '@/components/ui';
import { money } from '@/lib/format';
import { useData } from '@/store/data';

export default function SuppliersScreen() {
  const { suppliers, expenses } = useData();

  return (
    <Screen>
      <Button icon="add" label="Nuevo proveedor" onPress={() => router.push('/proveedores/form')} />
      {suppliers.length === 0 && (
        <Empty icon="business-outline" text="Guarda a quién le compras filamento y refacciones para saber cuánto llevas con cada uno." />
      )}
      {suppliers.map((supplier) => {
        const bought = expenses
          .filter((expense) => expense.supplier_id === supplier.id)
          .reduce((total, expense) => total + expense.amount, 0);
        return (
          <ListItem
            key={supplier.id}
            title={supplier.name}
            subtitle={[supplier.contact, supplier.phone].filter(Boolean).join(' · ')}
            value={bought ? money(bought) : undefined}
            valueHint={bought ? 'comprado' : undefined}
            onPress={() => router.push({ pathname: '/proveedores/form', params: { id: supplier.id } })}
          />
        );
      })}
    </Screen>
  );
}
