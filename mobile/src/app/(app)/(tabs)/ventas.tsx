import { router } from 'expo-router';

import { Button, confirmDelete, Empty, ErrorText, ListItem, Muted, Screen } from '@/components/ui';
import { day, money } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function SalesScreen() {
  const { sales } = useData();
  const { error, save } = useSave();

  return (
    <Screen>
      <Button variant="money" icon="cash" label="Registrar venta" onPress={() => router.push('/venta/nueva')} />
      <ErrorText>{error}</ErrorText>
      {sales.length === 0 ? (
        <Empty icon="cash-outline" text="Registra tus ventas de Mercado Libre, TikTok o directas y mira cuánto ganas en cada una." />
      ) : (
        <Muted>Mantén presionada una venta para eliminarla; las piezas vuelven al stock.</Muted>
      )}
      {sales.map((sale) => (
        <ListItem
          key={sale.id}
          title={`${sale.quantity} × ${sale.product_name}`}
          subtitle={`${sale.channel_name || 'Sin canal'} · ${day(sale.sold_at)}`}
          value={money(sale.quantity * sale.unit_price)}
          valueHint={`Ganancia ${money(sale.profit)}`}
          tone={sale.profit >= 0 ? 'good' : 'bad'}
          onLongPress={() =>
            confirmDelete(`Se eliminará la venta de ${sale.quantity} × ${sale.product_name}.`, () =>
              save(() => supabase.from('sales').delete().eq('id', sale.id), () => {}),
            )
          }
        />
      ))}
    </Screen>
  );
}
