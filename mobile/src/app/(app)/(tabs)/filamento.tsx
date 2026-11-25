import { router } from 'expo-router';

import { Button, Empty, ListItem, Row, Screen, Stat, Swatch } from '@/components/ui';
import { costPerGram, filamentName, isResin } from '@/lib/costs';
import { money, weight } from '@/lib/format';
import { filamentColors } from '@/lib/labels';
import { useData } from '@/store/data';

export default function FilamentsScreen() {
  const { filaments } = useData();
  const totalGrams = filaments.filter((filament) => !isResin(filament)).reduce((total, filament) => total + Math.max(filament.stock_g, 0), 0);
  const totalMl = filaments.filter(isResin).reduce((total, filament) => total + Math.max(filament.stock_g, 0), 0);
  const totalValue = filaments.reduce((total, filament) => total + Math.max(filament.stock_g, 0) * costPerGram(filament), 0);

  return (
    <Screen>
      <Row>
        <Button style={{ flex: 1 }} icon="albums" label="Del catálogo" onPress={() => router.push('/filamento/catalogo')} />
        <Button style={{ flex: 1 }} variant="secondary" icon="add" label="Nuevo" onPress={() => router.push('/filamento/form')} />
      </Row>
      {filaments.length === 0 ? (
        <Empty icon="color-fill-outline" text="Registra tus filamentos y resinas para llevar cuántos gramos o ml te quedan y cuánto cuesta cada pieza." />
      ) : (
        <Row>
          <Stat label={totalMl ? 'Filamento' : 'En existencia'} value={weight(totalGrams)} />
          {totalMl > 0 && <Stat label="Resina" value={weight(totalMl, true)} />}
          <Stat label="Valor del inventario" value={money(totalValue)} />
        </Row>
      )}
      {filaments.map((filament) => (
        <ListItem
          key={filament.id}
          left={<Swatch colors={filamentColors(filament)} glow={filament.glow} />}
          title={filamentName(filament)}
          subtitle={
            `${isResin(filament) ? 'Resina · ' : ''}${
              filament.avg_cost_per_g > 0
                ? `${money(filament.avg_cost_per_g * 1000)} por ${isResin(filament) ? 'litro' : 'kg'} · de tus compras`
                : `Referencia: ${money(filament.cost_per_kg)} por ${isResin(filament) ? 'litro' : 'kg'} · sin compras`
            }`
          }
          value={weight(filament.stock_g, isResin(filament))}
          tone={filament.stock_g <= filament.low_stock_g ? 'bad' : undefined}
          onPress={() => router.push({ pathname: '/filamento/form', params: { id: filament.id } })}
        />
      ))}
    </Screen>
  );
}
