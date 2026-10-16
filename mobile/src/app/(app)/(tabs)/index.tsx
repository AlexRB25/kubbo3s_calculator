import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, ErrorText, Heading, Line, ListItem, Muted, Row, Screen, Stat, Swatch } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { filamentName } from '@/lib/costs';
import { day, isoDay, money, weight } from '@/lib/format';
import { useData } from '@/store/data';

/** Days ahead that a scheduled maintenance starts showing up as pending. */
const MAINTENANCE_NOTICE_DAYS = 7;

export default function HomeScreen() {
  const { profile, sales, expenses, filaments, jobs, printers, maintenance, error } = useData();
  const [offset, setOffset] = useState(0);

  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const monthKey = isoDay(month).slice(0, 7);
  const monthSales = sales.filter((sale) => isoDay(new Date(sale.sold_at)).startsWith(monthKey));
  const monthExpenses = expenses.filter((expense) => expense.spent_at.startsWith(monthKey));

  const income = monthSales.reduce((total, sale) => total + sale.quantity * sale.unit_price, 0);
  const channelCosts = monthSales.reduce((total, sale) => total + sale.fees + sale.shipping_cost + sale.packaging_cost, 0);
  const production = monthSales.reduce((total, sale) => total + sale.quantity * sale.unit_cost, 0);
  const profit = monthSales.reduce((total, sale) => total + sale.profit, 0);
  const spent = monthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const cashFlow = income - channelCosts - spent;

  const lowFilaments = filaments.filter((filament) => filament.stock_g <= filament.low_stock_g);
  const printing = jobs.filter((job) => job.status === 'printing');
  const limit = new Date();
  limit.setDate(limit.getDate() + MAINTENANCE_NOTICE_DAYS);
  // Only each printer's latest record counts: doing the maintenance replaces the old reminder.
  const dueMaintenance = printers.flatMap((printer) => {
    const latest = maintenance.find((record) => record.printer_id === printer.id);
    return latest?.next_due && latest.next_due <= isoDay(limit) ? [{ printer, record: latest }] : [];
  });

  return (
    <Screen>
      <ErrorText>{error}</ErrorText>
      {profile?.business_name ? <Heading>{profile.business_name}</Heading> : null}

      <Row>
        <Button style={{ flex: 1 }} icon="print" label="Imprimir" onPress={() => router.push('/impresion/nueva')} />
        <Button style={{ flex: 1 }} variant="money" icon="cash" label="Vender" onPress={() => router.push('/venta/nueva')} />
        <Button style={{ flex: 1 }} variant="secondary" icon="receipt" label="Gasto" onPress={() => router.push('/gastos/nuevo')} />
      </Row>

      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" hitSlop={12} onPress={() => setOffset(offset - 1)}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '600', textTransform: 'capitalize' }}>
          {month.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          hitSlop={12}
          disabled={offset >= 0}
          onPress={() => setOffset(offset + 1)}>
          <Ionicons name="chevron-forward" size={22} color={offset >= 0 ? Colors.border : Colors.text} />
        </Pressable>
      </Row>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        <Stat label="Ventas" value={money(income)} />
        <Stat label="Ganancia de las ventas" value={money(profit)} tone={profit >= 0 ? 'good' : 'bad'} />
        <Stat label="Gastos" value={money(spent)} />
        <Stat label="Flujo de caja" value={money(cashFlow)} tone={cashFlow >= 0 ? 'good' : 'bad'} />
      </View>

      <Card>
        <Line label={`Ventas (${monthSales.length})`} value={money(income)} />
        <Line label="Comisiones, envíos y embalaje" value={`− ${money(channelCosts)}`} />
        <Line label="Costo de producir lo vendido" value={`− ${money(production)}`} />
        <Line strong label="Ganancia de las ventas" value={money(profit)} />
        <Muted>
          El flujo de caja es lo que entró menos lo que pagaste este mes (ventas − comisiones, envíos y embalaje − gastos). La ganancia
          compara cada venta con lo que costó producirla.
        </Muted>
      </Card>

      {printing.length > 0 && (
        <>
          <Heading>Imprimiendo ahora</Heading>
          {printing.map((job) => (
            <ListItem
              key={job.id}
              title={`${job.quantity} × ${job.product_name}`}
              subtitle={`${printers.find((printer) => printer.id === job.printer_id)?.name ?? 'Sin impresora'} · ${day(job.created_at)}`}
              value="Terminar"
              tone="warn"
              onPress={() => router.push({ pathname: '/impresion/[id]', params: { id: job.id } })}
            />
          ))}
        </>
      )}

      {lowFilaments.length > 0 && (
        <>
          <Heading>Filamento por acabarse</Heading>
          {lowFilaments.map((filament) => (
            <ListItem
              key={filament.id}
              left={<Swatch color={filament.color_hex} />}
              title={filamentName(filament)}
              subtitle={`Aviso al bajar de ${weight(filament.low_stock_g)}`}
              value={weight(filament.stock_g)}
              tone="bad"
              onPress={() => router.push({ pathname: '/filamento/compra', params: { id: filament.id } })}
            />
          ))}
        </>
      )}

      {dueMaintenance.length > 0 && (
        <>
          <Heading>Mantenimiento pendiente</Heading>
          {dueMaintenance.map(({ printer, record }) => (
            <ListItem
              key={printer.id}
              title={printer.name}
              subtitle={`Último: ${record.title}`}
              value={day(record.next_due!)}
              tone={record.next_due! <= isoDay() ? 'bad' : 'warn'}
              onPress={() => router.push({ pathname: '/impresoras/[id]', params: { id: printer.id } })}
            />
          ))}
        </>
      )}
    </Screen>
  );
}
