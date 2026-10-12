import { router } from 'expo-router';
import { useState } from 'react';

import { ProductThumb } from '@/components/product-thumb';
import { Button, Empty, Field, ListItem, Screen } from '@/components/ui';
import { productCost } from '@/lib/costs';
import { money } from '@/lib/format';
import { useData } from '@/store/data';

export default function ProductsScreen() {
  const { products, filaments, printers, profile } = useData();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(needle))
    : products;

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
          subtitle={`Costo ${money(productCost(product, filaments, printers, profile?.kwh_price ?? 0).total)}`}
          value={String(product.stock)}
          valueHint="en stock"
          tone={product.stock <= 0 ? 'bad' : undefined}
          onPress={() => router.push({ pathname: '/producto/[id]', params: { id: product.id } })}
        />
      ))}
    </Screen>
  );
}
