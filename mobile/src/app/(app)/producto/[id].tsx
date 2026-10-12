import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { ProductThumb } from '@/components/product-thumb';
import { Button, Card, Empty, Heading, Line, Muted, Row, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { channelFees, filamentName, productCost, suggestedPrice, unitProfit } from '@/lib/costs';
import { duration, money, weight } from '@/lib/format';
import { useData } from '@/store/data';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { products, filaments, printers, channels, profile } = useData();
  const product = products.find((item) => item.id === id);
  if (!product) return <Empty icon="cube-outline" text="Este producto ya no existe." />;

  const cost = productCost(product, filaments, printers, profile?.kwh_price ?? 0);
  const machines = printers.filter((printer) => product.printer_ids.includes(printer.id));

  return (
    <Screen>
      <Row style={{ gap: Spacing.three, alignItems: 'flex-start' }}>
        <ProductThumb path={product.image_path} size={112} />
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '700' }}>{product.name}</Text>
          {product.sku ? <Muted>{product.sku}</Muted> : null}
          <Text style={{ color: product.stock > 0 ? Colors.money : Colors.danger, fontSize: 16, fontWeight: '600' }}>
            {product.stock} en stock
          </Text>
        </View>
      </Row>
      {product.description ? <Muted>{product.description}</Muted> : null}

      <Row>
        <Button style={{ flex: 1 }} icon="print" label="Imprimir" onPress={() => router.push({ pathname: '/impresion/nueva', params: { producto: product.id } })} />
        <Button style={{ flex: 1 }} variant="money" icon="cash" label="Vender" onPress={() => router.push({ pathname: '/venta/nueva', params: { producto: product.id } })} />
      </Row>

      <Heading>Costo por pieza</Heading>
      <Card>
        {product.filaments.map((use) => {
          const filament = filaments.find((item) => item.id === use.filament_id);
          return (
            <Line
              key={use.filament_id}
              label={`${filament ? filamentName(filament) : 'Filamento eliminado'} · ${weight(use.grams)}`}
              value={money((use.grams / 1000) * (filament?.cost_per_kg ?? 0))}
            />
          );
        })}
        <Line label={`Luz · ${duration(product.print_minutes)}`} value={money(cost.electricity)} />
        <Line label="Desgaste de máquina" value={money(cost.machine)} />
        <Line label="Otros costos" value={money(cost.extra)} />
        <Line strong label="Total" value={money(cost.total)} />
        <Muted>
          {machines.length ? `Sale en: ${machines.map((printer) => printer.name).join(', ')}.` : 'Sin máquina asignada: no se suma luz ni desgaste.'}
        </Muted>
      </Card>

      <Heading>Venta por canal</Heading>
      {channels.map((channel) => {
        const price = product.prices[channel.id] ?? 0;
        const suggested = suggestedPrice(cost.total, channel, profile?.margin_pct ?? 0);
        if (!price) {
          return (
            <Card key={channel.id}>
              <Line strong label={channel.name} value="Sin precio" />
              <Line label={`Sugerido para ganar ${profile?.margin_pct ?? 0}% sobre el costo`} value={money(suggested)} />
            </Card>
          );
        }
        const profit = unitProfit(price, cost.total, channel);
        return (
          <Card key={channel.id}>
            <Line strong label={channel.name} value={money(price)} />
            <Line label={`Comisión (${channel.commission_pct}%${channel.fixed_fee ? ` + ${money(channel.fixed_fee)}` : ''})`} value={`− ${money(channelFees(channel, price))}`} />
            <Line label="Envío" value={`− ${money(channel.shipping_cost)}`} />
            <Line label="Costo de la pieza" value={`− ${money(cost.total)}`} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600' }}>Ganancia</Text>
              <Text style={{ color: profit >= 0 ? Colors.money : Colors.danger, fontSize: 15, fontWeight: '700' }}>
                {money(profit)} ({Math.round((profit / price) * 100)}%)
              </Text>
            </Row>
            <Muted>Precio sugerido: {money(suggested)}</Muted>
          </Card>
        );
      })}

      <Button variant="secondary" icon="create" label="Editar producto" onPress={() => router.push({ pathname: '/producto/form', params: { id: product.id } })} />
    </Screen>
  );
}
