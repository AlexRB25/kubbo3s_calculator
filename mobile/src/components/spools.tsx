import { router } from 'expo-router';

import { Button, Empty, ListItem, Row, Screen, Stat, Swatch } from '@/components/ui';
import { costPerGram, filamentName, isResin } from '@/lib/costs';
import { money, weight } from '@/lib/format';
import { filamentColors } from '@/lib/labels';
import { useData } from '@/store/data';

/**
 * Filament (grams, price per kg) or resin (ml, price per litre): the same list, each on its own screen with only its
 * own kind.
 */
export function SpoolsScreen({ kind }: { kind: 'filament' | 'resin' }) {
  const resin = kind === 'resin';
  const { filaments: all } = useData();
  const filaments = all.filter((filament) => isResin(filament) === resin);
  const total = filaments.reduce((sum, filament) => sum + Math.max(filament.stock_g, 0), 0);
  const totalValue = filaments.reduce((sum, filament) => sum + Math.max(filament.stock_g, 0) * costPerGram(filament), 0);
  const per = resin ? 'litro' : 'kg';

  return (
    <Screen>
      <Row>
        {!resin && <Button style={{ flex: 1 }} icon="albums" label="Del catálogo" onPress={() => router.push('/filamento/catalogo')} />}
        <Button
          style={{ flex: 1 }}
          variant={resin ? 'primary' : 'secondary'}
          icon="add"
          label={resin ? 'Nueva resina' : 'Nuevo'}
          onPress={() => router.push({ pathname: '/filamento/form', params: { kind } })}
        />
      </Row>
      {filaments.length === 0 ? (
        <Empty
          icon={resin ? 'water-outline' : 'color-fill-outline'}
          text={
            resin
              ? 'Registra tus resinas para llevar cuántos ml te quedan y cuánto cuesta cada pieza. Se miden en ml y su precio es por litro.'
              : 'Registra tus filamentos para llevar cuántos gramos te quedan y cuánto cuesta cada pieza.'
          }
        />
      ) : (
        <Row>
          <Stat label="En existencia" value={weight(total, resin)} />
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
              ? `${money(filament.avg_cost_per_g * 1000)} por ${per} · de tus compras`
              : `Referencia: ${money(filament.cost_per_kg)} por ${per} · sin compras`
          }
          value={weight(filament.stock_g, resin)}
          tone={filament.stock_g <= filament.low_stock_g ? 'bad' : undefined}
          onPress={() => router.push({ pathname: '/filamento/form', params: { id: filament.id } })}
        />
      ))}
    </Screen>
  );
}
