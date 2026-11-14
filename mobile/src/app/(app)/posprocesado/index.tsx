import { router } from 'expo-router';

import { Button, Empty, ListItem, Screen } from '@/components/ui';
import { money } from '@/lib/format';
import { useData } from '@/store/data';

/** Hand jobs after printing (sanding, painting…) with what one hour of each costs, like the web's Posprocesado. */
export default function PostProcessesScreen() {
  const { postProcesses, products } = useData();

  return (
    <Screen>
      <Button icon="add" label="Nuevo proceso" onPress={() => router.push('/posprocesado/form')} />
      {postProcesses.length === 0 && (
        <Empty
          icon="brush-outline"
          text="Da de alta lo que haces a mano después de imprimir y lo que vale la hora: lijado $100 por hora, pintado, pegado… En cada producto (pestaña Costos) pones los minutos y su costo se suma solo."
        />
      )}
      {postProcesses.map((process) => {
        const used = products.filter((product) => product.processes?.some((use) => use.process_id === process.id)).length;
        return (
          <ListItem
            key={process.id}
            title={process.name}
            subtitle={used ? `En ${used} ${used === 1 ? 'producto' : 'productos'}` : process.notes}
            value={money(Number(process.cost_per_hour))}
            valueHint="por hora"
            onPress={() => router.push({ pathname: '/posprocesado/form', params: { id: process.id } })}
          />
        );
      })}
    </Screen>
  );
}
