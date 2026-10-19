import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { Button, Card, confirmDelete, Empty, ErrorText, Heading, Line, ListItem, Muted, Row, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { day, duration, money } from '@/lib/format';
import { maintenanceLabel } from '@/lib/labels';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function PrinterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { printers, maintenance, jobs } = useData();
  const { error, save } = useSave();
  const printer = printers.find((item) => item.id === id);
  if (!printer) return <Empty icon="print-outline" text="Esta impresora ya no existe." />;

  const history = maintenance.filter((record) => record.printer_id === printer.id);
  const printerJobs = jobs.filter((job) => job.printer_id === printer.id);
  const failed = printerJobs.filter((job) => job.status === 'failed').length;
  const spent = history.reduce((total, record) => total + record.cost, 0);
  const nextDue = history[0]?.next_due;

  return (
    <Screen>
      <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '700' }}>{printer.name}</Text>
      <Muted>
        {[printer.brand, printer.model].filter(Boolean).join(' ')}
        {printer.device_id ? ` · ID ${printer.device_id}` : ''}
      </Muted>

      <Card>
        <Line label="Tiempo impreso" value={duration(printer.print_minutes + printer.initial_minutes)} />
        {printer.initial_minutes > 0 ? <Line label="Antes de registrarla" value={duration(printer.initial_minutes)} /> : null}
        {printer.purchase_price > 0 ? <Line label="Te costó" value={money(printer.purchase_price)} /> : null}
        <Line label="Impresiones" value={`${printerJobs.length}${failed ? ` (${failed} fallidas)` : ''}`} />
        <Line label="Consumo" value={`${printer.power_watts} W`} />
        <Line label="Desgaste por hora" value={money(printer.hourly_cost)} />
        <Line label="Gastado en mantenimiento" value={money(spent)} />
        {nextDue ? <Line strong label="Próximo mantenimiento" value={day(nextDue)} /> : null}
        {printer.notes ? <Muted>{printer.notes}</Muted> : null}
      </Card>

      <Row>
        <Button
          style={{ flex: 1 }}
          icon="construct"
          label="Registrar servicio"
          onPress={() => router.push({ pathname: '/impresoras/mantenimiento', params: { impresora: printer.id } })}
        />
        <Button
          variant="secondary"
          icon="create"
          label="Editar"
          onPress={() => router.push({ pathname: '/impresoras/form', params: { id: printer.id } })}
        />
      </Row>

      <Heading>Historial de mantenimientos y ajustes</Heading>
      <ErrorText>{error}</ErrorText>
      {history.length === 0 ? (
        <Muted>Aquí quedará cada mantenimiento, ajuste o reparación que le hagas a esta impresora.</Muted>
      ) : (
        <Muted>Mantén presionado un registro para eliminarlo.</Muted>
      )}
      {history.map((record) => (
        <ListItem
          key={record.id}
          title={record.title}
          subtitle={[`${maintenanceLabel(record.kind)} · ${day(record.performed_at)}`, record.notes].filter(Boolean).join('\n')}
          value={record.cost ? money(record.cost) : undefined}
          onLongPress={() =>
            confirmDelete(`Se eliminará "${record.title}"${record.cost ? ' y su gasto' : ''}.`, () =>
              save(() => supabase.from('maintenance').delete().eq('id', record.id), () => {}),
            )
          }
        />
      ))}
    </Screen>
  );
}
