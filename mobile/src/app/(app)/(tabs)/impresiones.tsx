import { router } from 'expo-router';

import { Button, Empty, ListItem, Screen } from '@/components/ui';
import { day, weight } from '@/lib/format';
import type { PrintStatus } from '@/lib/types';
import { useData } from '@/store/data';

const STATUS: Record<PrintStatus, { label: string; tone: 'good' | 'bad' | 'warn' }> = {
  printing: { label: 'Imprimiendo', tone: 'warn' },
  done: { label: 'Terminada', tone: 'good' },
  failed: { label: 'Falló', tone: 'bad' },
};

export default function PrintsScreen() {
  const { jobs, printers } = useData();

  return (
    <Screen>
      <Button icon="print" label="Mandar a imprimir" onPress={() => router.push('/impresion/nueva')} />
      {jobs.length === 0 && (
        <Empty icon="print-outline" text="Registra cada impresión: el filamento que consume se descuenta solo y las piezas buenas entran a tu stock." />
      )}
      {jobs.map((job) => {
        const grams = job.print_job_filaments.reduce((total, use) => total + use.grams, 0);
        const printer = printers.find((item) => item.id === job.printer_id)?.name ?? 'Sin impresora';
        return (
          <ListItem
            key={job.id}
            title={`${job.quantity} × ${job.product_name}`}
            subtitle={`${printer} · ${weight(grams)} · ${day(job.created_at)}`}
            value={STATUS[job.status].label}
            valueHint={job.status === 'done' && job.good_quantity < job.quantity ? `${job.good_quantity} buenas` : undefined}
            tone={STATUS[job.status].tone}
            onPress={() => router.push({ pathname: '/impresion/[id]', params: { id: job.id } })}
          />
        );
      })}
    </Screen>
  );
}
