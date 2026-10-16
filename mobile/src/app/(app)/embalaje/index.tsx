import { router } from 'expo-router';

import { Button, Empty, ListItem, Screen } from '@/components/ui';
import { packagingName } from '@/lib/costs';
import { money } from '@/lib/format';
import { PACKAGING_KINDS } from '@/lib/labels';
import { useData } from '@/store/data';

export default function PackagingScreen() {
  const { packaging, products } = useData();

  return (
    <Screen>
      <Button icon="add" label="Nuevo embalaje" onPress={() => router.push('/embalaje/form')} />
      {packaging.length === 0 && (
        <Empty icon="cube-outline" text="Registra tus cajas, sobres y bolsas con sus medidas y costo para sumarlos al precio con envío de cada producto." />
      )}
      {packaging.map((item) => {
        const used = products.filter((product) => product.packaging_id === item.id).length;
        return (
          <ListItem
            key={item.id}
            title={packagingName(item)}
            subtitle={[PACKAGING_KINDS.find((kind) => kind.value === item.kind)?.label, used ? `${used} productos` : ''].filter(Boolean).join(' · ')}
            value={money(item.cost)}
            onPress={() => router.push({ pathname: '/embalaje/form', params: { id: item.id } })}
          />
        );
      })}
    </Screen>
  );
}
