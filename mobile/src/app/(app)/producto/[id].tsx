import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { ProductThumb } from '@/components/product-thumb';
import { Button, Card, Empty, Heading, Line, Muted, Row, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { channelFees, costPerGram, filamentName, packagingName, productCost, shippingCost, suggestedPrice, unitProfit } from '@/lib/costs';
import { duration, money, weight } from '@/lib/format';
import { useData } from '@/store/data';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { products, filaments, printers, channels, profile, packaging, materials } = useData();
  const product = products.find((item) => item.id === id);
  if (!product) return <Empty icon="cube-outline" text="Este producto ya no existe." />;

  const cost = productCost(product, filaments, printers, profile?.kwh_price ?? 0, materials);
  const machines = printers.filter((printer) => product.printer_ids.includes(printer.id));
  const box = packaging.find((item) => item.id === product.packaging_id);
  const margin = profile?.margin_pct ?? 0;

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
              value={money(use.grams * (filament ? costPerGram(filament) : 0))}
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

      <Card>
        <Line label={box ? `Embalaje: ${packagingName(box)}` : 'Sin embalaje asignado'} value={box ? money(box.cost) : '—'} />
        <Muted>El embalaje y el envío del canal solo cuentan en las ventas con envío.</Muted>
      </Card>

      <Heading>Venta por canal</Heading>
      {channels.map((channel) => {
        const price = product.prices[channel.id] ?? 0;
        const shipping = shippingCost(channel, box);
        const suggested = `Sugerido: ${money(suggestedPrice(cost.total, channel, margin))} sin envío · ${money(suggestedPrice(cost.total, channel, margin, shipping))} con envío`;
        if (!price) {
          return (
            <Card key={channel.id}>
              <Line strong label={channel.name} value="Sin precio" />
              <Muted>{suggested}</Muted>
            </Card>
          );
        }
        const withoutShipping = unitProfit(price, cost.total, channel);
        const withShipping = unitProfit(price, cost.total, channel, shipping);
        const profitLine = (label: string, profit: number) => (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
            <Text style={{ color: profit >= 0 ? Colors.money : Colors.danger, fontSize: 15, fontWeight: '700' }}>
              {money(profit)} ({Math.round((profit / price) * 100)}%)
            </Text>
          </Row>
        );
        return (
          <Card key={channel.id}>
            <Line strong label={channel.name} value={money(price)} />
            <Line label={`Comisión (${channel.commission_pct}%${channel.tax_pct ? ` + ${channel.tax_pct}% imp.` : ''}${channel.fixed_fee ? ` + ${money(channel.fixed_fee)}` : ''})`} value={`− ${money(channelFees(channel, price))}`} />
            <Line label="Costo de la pieza" value={`− ${money(cost.total)}`} />
            {profitLine('Ganancia sin envío', withoutShipping)}
            <Line label="Envío del canal" value={`− ${money(channel.shipping_cost)}`} />
            <Line label="Embalaje" value={`− ${money(box?.cost ?? 0)}`} />
            {profitLine('Ganancia con envío', withShipping)}
            <Muted>{suggested}</Muted>
          </Card>
        );
      })}

      <Button variant="secondary" icon="create" label="Editar producto" onPress={() => router.push({ pathname: '/producto/form', params: { id: product.id } })} />
    </Screen>
  );
}
