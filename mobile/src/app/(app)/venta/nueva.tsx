import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Chips, ErrorText, Field, Line, Muted, Row, Screen, Select } from '@/components/ui';
import { channelFees, productCost } from '@/lib/costs';
import { money, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function NewSaleScreen() {
  const { producto } = useLocalSearchParams<{ producto?: string }>();
  const { products, channels, filaments, printers, profile } = useData();
  const { busy, error, setError, save } = useSave();

  const [productId, setProductId] = useState<string | null>(producto ?? null);
  const [customName, setCustomName] = useState('');
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  // Empty fields use the automatic value shown as placeholder.
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');
  const [shipping, setShipping] = useState('');
  const [customCost, setCustomCost] = useState('');
  const [notes, setNotes] = useState('');

  const product = products.find((item) => item.id === productId);
  const channel = channels.find((item) => item.id === channelId);
  const pieces = Math.max(Math.round(num(quantity)), 0);
  const listPrice = product?.prices[channelId] ?? 0;
  const unitPrice = price === '' ? listPrice : num(price);
  const autoFees = channelFees(channel, unitPrice, pieces);
  const totalFees = fees === '' ? autoFees : num(fees);
  const autoShipping = channel?.shipping_cost ?? 0;
  const totalShipping = shipping === '' ? autoShipping : num(shipping);
  const unitCost = product ? productCost(product, filaments, printers, profile?.kwh_price ?? 0).total : num(customCost);
  const profit = pieces * unitPrice - totalFees - totalShipping - pieces * unitCost;

  function submit() {
    const name = product?.name ?? customName.trim();
    if (!name) return setError('Elige un producto o escribe qué vendiste.');
    if (pieces < 1) return setError('Indica cuántas piezas vendiste.');
    if (unitPrice <= 0) return setError('Indica el precio de venta.');
    save(() =>
      supabase.from('sales').insert({
        product_id: productId,
        product_name: name,
        channel_id: channel?.id ?? null,
        channel_name: channel?.name ?? '',
        quantity: pieces,
        unit_price: unitPrice,
        fees: totalFees,
        shipping_cost: totalShipping,
        unit_cost: Math.round(unitCost * 100) / 100,
        notes: notes.trim(),
      }),
    );
  }

  return (
    <Screen>
      <Select
        label="Producto"
        value={productId}
        onChange={setProductId}
        none="Otra cosa (sin producto)"
        options={products.map((item) => ({ value: item.id, label: item.name, hint: `${item.stock} en stock` }))}
      />
      {!product && (
        <Row>
          <Field style={{ flex: 2 }} label="¿Qué vendiste?" value={customName} onChangeText={setCustomName} maxLength={80} />
          <Field style={{ flex: 1 }} label="Costo por pieza" unit="$" numeric value={customCost} onChangeText={setCustomCost} placeholder="0" />
        </Row>
      )}
      {product && pieces > product.stock && (
        <Muted>Solo hay {product.stock} en stock: la venta se registra igual y el stock quedará en negativo.</Muted>
      )}

      <Chips
        label="Canal"
        options={channels.map((item) => ({ value: item.id, label: item.name }))}
        value={channelId}
        onChange={setChannelId}
      />
      <Row>
        <Field style={{ flex: 1 }} label="Piezas" numeric value={quantity} onChangeText={setQuantity} />
        <Field
          style={{ flex: 1 }}
          label="Precio por pieza"
          unit="$"
          numeric
          value={price}
          onChangeText={setPrice}
          placeholder={listPrice ? listPrice.toFixed(2) : '0'}
        />
      </Row>
      <Row>
        <Field
          style={{ flex: 1 }}
          label="Comisiones"
          unit="$"
          numeric
          value={fees}
          onChangeText={setFees}
          placeholder={autoFees.toFixed(2)}
        />
        <Field
          style={{ flex: 1 }}
          label="Envío que pagaste"
          unit="$"
          numeric
          value={shipping}
          onChangeText={setShipping}
          placeholder={autoShipping.toFixed(2)}
        />
      </Row>
      <Muted>Comisión y envío salen del canal; escribe el dato real si la plataforma te cobró otra cosa.</Muted>
      <Field label="Notas" value={notes} onChangeText={setNotes} maxLength={200} placeholder="Número de pedido, cliente…" />

      <Card>
        <Line label={`${pieces} × ${money(unitPrice)}`} value={money(pieces * unitPrice)} />
        <Line label="Comisiones" value={`− ${money(totalFees)}`} />
        <Line label="Envío" value={`− ${money(totalShipping)}`} />
        <Line label={`Costo de producción (${money(unitCost)} c/u)`} value={`− ${money(pieces * unitCost)}`} />
        <Line strong label="Ganancia" value={money(profit)} />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="money" label="Registrar venta" onPress={submit} loading={busy} />
    </Screen>
  );
}
