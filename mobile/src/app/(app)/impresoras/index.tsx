import { router } from 'expo-router';

import { Button, Empty, ListItem, Screen } from '@/components/ui';
import { day, duration } from '@/lib/format';
import { useData } from '@/store/data';

export default function PrintersScreen() {
  const { printers, maintenance } = useData();

  return (
    <Screen>
      <Button icon="add" label="Nueva impresora" onPress={() => router.push('/impresoras/form')} />
      {printers.length === 0 && (
        <Empty icon="print-outline" text="Da de alta tus impresoras para llevar sus horas, mantenimientos y ajustes, y sumar luz y desgaste al costo." />
      )}
      {printers.map((printer) => {
        const latest = maintenance.find((record) => record.printer_id === printer.id);
        return (
          <ListItem
            key={printer.id}
            title={printer.name}
            subtitle={[printer.model, latest ? `Último servicio ${day(latest.performed_at)}` : 'Sin mantenimientos'].filter(Boolean).join(' · ')}
            value={duration(printer.print_minutes)}
            valueHint="impresas"
            onPress={() => router.push({ pathname: '/impresoras/[id]', params: { id: printer.id } })}
          />
        );
      })}
    </Screen>
  );
}
