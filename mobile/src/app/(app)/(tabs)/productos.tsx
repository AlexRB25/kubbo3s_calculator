import { router } from 'expo-router';
import { useState } from 'react';

import { ProductThumb } from '@/components/product-thumb';
import { Button, Empty, Field, ListItem, Screen } from '@/components/ui';
import { overheadPerPiece, productCost, shippingFor, suggestedPriceWithShipping, unitProfit } from '@/lib/costs';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { useData } from '@/store/data';

export default function ProductsScreen() {
  const { products, filaments, printers, profile, materials, channels, carriers, packaging } = useData();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(needle))
    : products;

  /** Cost, and the profit per piece: at its own price in each channel, or estimated at the suggested price. */
  function summary(product: Product) {
    const cost = productCost(product, filaments, printers, profile?.kwh_price ?? 0, materials, profile?.waste_rules, overheadPerPiece(profile)).total;
    const grams = product.filaments.reduce((total, use) => total + use.grams, 0);
    const box = packaging.find((item) => item.id === product.packaging_id);
    let estimated = false;
    const profits = channels.flatMap((channel) => {
      const shippingAt = (at: number) => shippingFor(channel, carriers, grams, box, at);
      let price = product.prices[channel.id] ?? 0;
      if (!price) {
        price = suggestedPriceWithShipping(cost, channel, profile?.margin_pct ?? 0, shippingAt);
        estimated = true;
      }
      return price > 0 ? [unitProfit(price, cost, channel, shippingAt(price))] : [];
    });
    if (!profits.length) return `Costo ${money(cost)}`;
    const low = Math.min(...profits);
    const high = Math.max(...profits);
    const range = Math.abs(high - low) < 0.5 ? money(high) : `${money(low)} a ${money(high)}`;
    return `Costo ${money(cost)} · gana ${estimated ? '~' : ''}${range}${estimated ? ' (estimado)' : ''}`;
  }

  return (
    <Screen>
      <Button icon="add" label="Nuevo producto" onPress={() => router.push('/producto/form')} />
      {products.length > 6 && <Field label="Buscar" value={query} onChangeText={setQuery} placeholder="Nombre o SKU" />}
      {products.length === 0 && (
        <Empty icon="cube-outline" text="Da de alta tus productos con su foto, el filamento que consumen y en qué máquinas salen." />
      )}
      {visible.map((product) => (
        <ListItem
          key={product.id}
          left={<ProductThumb path={product.image_path} />}
          title={product.name}
          subtitle={summary(product)}
          value={String(product.stock)}
          valueHint="en stock"
          tone={product.stock <= 0 ? 'bad' : undefined}
          onPress={() => router.push({ pathname: '/producto/[id]', params: { id: product.id } })}
        />
      ))}
    </Screen>
  );
}
