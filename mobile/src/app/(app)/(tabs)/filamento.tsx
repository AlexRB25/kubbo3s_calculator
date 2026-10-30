import { router } from 'expo-router';

import { Button, Empty, ListItem, Row, Screen, Stat, Swatch } from '@/components/ui';
import { costPerGram, filamentName } from '@/lib/costs';
import { money, weight } from '@/lib/format';
import { filamentColors } from '@/lib/labels';
import { useData } from '@/store/data';

export default function FilamentsScreen() {
  const { filaments } = useData();
  const totalGrams = filaments.reduce((total, filament) => total + Math.max(filament.stock_g, 0), 0);
  const totalValue = filaments.reduce((total, filament) => total + Math.max(filament.stock_g, 0) * costPerGram(filament), 0);

  return (
    <Screen>
      <Button icon="add" label="Nuevo filamento" onPress={() => router.push('/filamento/form')} />
      {filaments.length === 0 ? (
        <Empty icon="color-fill-outline" text="Registra tus filamentos para llevar cuántos gramos te quedan y cuánto cuesta cada pieza." />
      ) : (
        <Row>
          <Stat label="En existencia" value={weight(totalGrams)} />
          <Stat label="Valor del inventario" value={money(totalValue)} />
        </Row>
      )}
      {filaments.map((filament) => (
        <ListItem
          key={filament.id}
          left={<Swatch colors={filamentColors(filament)} glow={filament.glow} />}
          title={filamentName(filament)}
          subtitle={
            filament.avg_cost_per_g > 0
              ? `${money(filament.avg_cost_per_g * 1000)} por kg · de tus compras`
              : `Referencia: ${money(filament.cost_per_kg)} por kg · sin compras`
          }
          value={weight(filament.stock_g)}
          tone={filament.stock_g <= filament.low_stock_g ? 'bad' : undefined}
          onPress={() => router.push({ pathname: '/filamento/form', params: { id: filament.id } })}
        />
      ))}
    </Screen>
  );
}
