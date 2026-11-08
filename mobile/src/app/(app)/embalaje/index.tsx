import { router } from 'expo-router';

import { BoxThumb } from '@/components/box-preview';
import { Button, Empty, ListItem, Row, Screen } from '@/components/ui';
import { packagingName } from '@/lib/costs';
import { money } from '@/lib/format';
import { PACKAGING_KINDS } from '@/lib/labels';
import { useData } from '@/store/data';

export default function PackagingScreen() {
  const { packaging, products, profile } = useData();
  // The catalog came with the same database update as the clients.
  const withCatalog = profile?.client_fields !== undefined;

  return (
    <Screen>
      <Row>
        {withCatalog && <Button style={{ flex: 1 }} icon="albums" label="Del catálogo" onPress={() => router.push('/embalaje/catalogo')} />}
        <Button style={{ flex: 1 }} variant={withCatalog ? 'secondary' : 'primary'} icon="add" label="Nuevo" onPress={() => router.push('/embalaje/form')} />
      </Row>
      {packaging.length === 0 && (
        <Empty icon="cube-outline" text="Registra tus cajas, sobres y bolsas con sus medidas y costo para sumarlos al precio con envío de cada producto." />
      )}
      {packaging.map((item) => {
        const used = products.filter((product) => product.packaging_id === item.id).length;
        return (
          <ListItem
            key={item.id}
            left={item.length_mm > 0 && item.width_mm > 0 && item.height_mm > 0 ? <BoxThumb box={item} size={44} /> : undefined}
            title={packagingName(item)}
            subtitle={[
              PACKAGING_KINDS.find((kind) => kind.value === item.kind)?.label,
              `${item.stock ?? 0} en existencia`,
              item.weight_g > 0 ? `${Number(item.weight_g)} g` : '',
              used ? `${used} productos` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            value={money(item.cost)}
            onPress={() => router.push({ pathname: '/embalaje/form', params: { id: item.id } })}
          />
        );
      })}
    </Screen>
  );
}
