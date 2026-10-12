import { router } from 'expo-router';

import { Button, ListItem, Muted, Screen } from '@/components/ui';
import { money } from '@/lib/format';
import { useData } from '@/store/data';

export default function ChannelsScreen() {
  const { channels } = useData();

  return (
    <Screen>
      <Muted>
        Las comisiones de arranque son aproximadas: cámbialas por las que tu cuenta paga de verdad en cada plataforma, porque de
        ellas sale el precio sugerido y la ganancia de cada venta.
      </Muted>
      {channels.map((channel) => (
        <ListItem
          key={channel.id}
          title={channel.name}
          subtitle={`Cargo fijo ${money(channel.fixed_fee)} · envío ${money(channel.shipping_cost)}`}
          value={`${channel.commission_pct}%`}
          valueHint="comisión"
          onPress={() => router.push({ pathname: '/canales/form', params: { id: channel.id } })}
        />
      ))}
      <Button variant="secondary" icon="add" label="Nuevo canal" onPress={() => router.push('/canales/form')} />
    </Screen>
  );
}
