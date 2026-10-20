import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Chips, ErrorText, Field, Line, Muted, Row, Screen, Select } from '@/components/ui';
import { channelFees, productCost } from '@/lib/costs';
import { money, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function NewSaleScreen() {
  const { producto } = useLocalSearchParams<{ producto?: string }>();
  const { products, channels, filaments, printers, profile, packaging, materials } = useData();
  const { busy, error, setError, save } = useSave();

  const [productId, setProductId] = useState<string | null>(producto ?? null);
  const [customName, setCustomName] = useState('');
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [quantity, setQuantity] = useState('1');
  // Empty fields use the automatic value shown as placeholder.
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');
  const [delivery, setDelivery] = useState<'shipped' | 'pickup'>('shipped');
  const [shipping, setShipping] = useState('');
  const [packagingCost, setPackagingCost] = useState('');
  const [customCost, setCustomCost] = useState('');
  const [notes, setNotes] = useState('');

  const product = products.find((item) => item.id === productId);
  const channel = channels.find((item) => item.id === channelId);
  const pieces = Math.max(Math.round(num(quantity)), 0);
  const listPrice = product?.prices[channelId] ?? 0;
  // What it really sold for; the channel price is only a reference to tell the discount.
  const unitPrice = num(price);
  const discount = listPrice > 0 && price !== '' ? listPrice - unitPrice : 0;
  const autoFees = channelFees(channel, unitPrice, pieces);
  const totalFees = fees === '' ? autoFees : num(fees);
  const shipped = delivery === 'shipped';
  const autoShipping = shipped ? (channel?.shipping_cost ?? 0) : 0;
  const totalShipping = shipped && shipping !== '' ? num(shipping) : autoShipping;
  // One package per sale, whatever the number of pieces.
  const autoPackaging = shipped ? (packaging.find((item) => item.id === product?.packaging_id)?.cost ?? 0) : 0;
  const totalPackaging = shipped && packagingCost !== '' ? num(packagingCost) : autoPackaging;
  const unitCost = product ? productCost(product, filaments, printers, profile?.kwh_price ?? 0, materials).total : num(customCost);
  const profit = pieces * unitPrice - totalFees - totalShipping - totalPackaging - pieces * unitCost;

  function submit() {
    const name = product?.name ?? customName.trim();
    if (!name) return setError('Elige un producto o escribe qué vendiste.');
    if (pieces < 1) return setError('Indica cuántas piezas vendiste.');
    if (price === '' || unitPrice <= 0) return setError('Indica en cuánto lo vendiste.');
    save(() =>
      supabase.from('sales').insert({
        product_id: productId,
        product_name: name,
        channel_id: channel?.id ?? null,
        channel_name: channel?.name ?? '',
        quantity: pieces,
        unit_price: unitPrice,
        list_price: listPrice > 0 ? listPrice : null,
        fees: totalFees,
        shipping_cost: totalShipping,
        packaging_cost: totalPackaging,
        // One package leaves stock with each shipped sale.
        packaging_id: shipped ? (product?.packaging_id ?? null) : null,
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
          label="¿En cuánto lo vendiste?"
          unit="$"
          numeric
          value={price}
          onChangeText={setPrice}
          placeholder="0"
        />
      </Row>
      {listPrice > 0 && (
        <Muted>
          {discount > 0
            ? `Descuento de ${money(discount)} (${Math.round((discount / listPrice) * 100)}%) sobre tu precio de lista de ${money(listPrice)}.`
            : discount < 0
              ? `${money(-discount)} arriba de tu precio de lista de ${money(listPrice)}.`
              : `Tu precio de lista es ${money(listPrice)} por pieza.`}
        </Muted>
      )}
      <Field label="Comisiones e impuestos" unit="$" numeric value={fees} onChangeText={setFees} placeholder={autoFees.toFixed(2)} />
      <Chips
        label="Entrega"
        options={[
          { value: 'shipped', label: 'Con envío' },
          { value: 'pickup', label: 'Sin envío' },
        ]}
        value={delivery}
        onChange={setDelivery}
      />
      {shipped ? (
        <Row>
          <Field
            style={{ flex: 1 }}
            label="Envío que pagaste"
            unit="$"
            numeric
            value={shipping}
            onChangeText={setShipping}
            placeholder={autoShipping.toFixed(2)}
          />
          <Field
            style={{ flex: 1 }}
            label="Embalaje"
            unit="$"
            numeric
            value={packagingCost}
            onChangeText={setPackagingCost}
            placeholder={autoPackaging.toFixed(2)}
          />
        </Row>
      ) : (
        <Muted>Sin envío: el cliente recoge o paga su envío, así que no se descuenta envío ni embalaje.</Muted>
      )}
      <Muted>Los montos salen del canal y del embalaje del producto; escribe el dato real si te cobraron otra cosa.</Muted>
      <Field label="Notas" value={notes} onChangeText={setNotes} maxLength={200} placeholder="Número de pedido, cliente…" />

      <Card>
        {discount > 0 && <Line label="Descuento" value={`− ${money(pieces * discount)}`} />}
        <Line label={`Vendiste ${pieces} × ${money(unitPrice)}`} value={money(pieces * unitPrice)} />
        <Line label="Comisiones e impuestos" value={`− ${money(totalFees)}`} />
        <Line label="Envío" value={`− ${money(totalShipping)}`} />
        <Line label="Embalaje" value={`− ${money(totalPackaging)}`} />
        <Line label={`Costo de producción (${money(unitCost)} c/u)`} value={`− ${money(pieces * unitCost)}`} />
        <Line strong label={profit >= 0 ? 'Ganancia' : 'Pérdida'} value={money(profit)} />
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button variant="money" label="Registrar venta" onPress={submit} loading={busy} />
    </Screen>
  );
}
