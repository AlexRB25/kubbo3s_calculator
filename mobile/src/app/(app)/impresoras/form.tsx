import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Card, Chips, confirmDelete, ErrorText, Field, Muted, Row, Screen, Select } from '@/components/ui';
import { field, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { CatalogPrinter } from '@/lib/types';
import { useData, useSave } from '@/store/data';

const OTHER = '__otra';

/** Models that print in resin, to propose it when one is picked. */
const RESIN_MODEL = /mars|saturn|jupiter|photon|halot|sonic|sl1|form ?[234]|uniformation|gktwo|proxima|nova3d|elfin/i;

/** "Bambu Lab A1 · 605": model (or brand) plus the end of the device id, to tell equal printers apart. */
function printerName(brand: string, model: string, deviceId: string) {
  const base = [brand, model].filter(Boolean).join(' ') || 'Impresora';
  const id = deviceId.trim();
  return id ? `${base} · ${id.length > 6 ? id.slice(-4) : id}` : base;
}

export default function PrinterFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { printers } = useData();
  const { busy, error, setError, save } = useSave();
  const printer = printers.find((item) => item.id === id);

  const [catalog, setCatalog] = useState<CatalogPrinter[]>([]);
  const [brand, setBrand] = useState(printer?.brand ?? '');
  const [model, setModel] = useState(printer?.model ?? '');
  // Typing by hand: the brand or model is not in the catalog.
  const [otherBrand, setOtherBrand] = useState(false);
  const [otherModel, setOtherModel] = useState(false);
  const [deviceId, setDeviceId] = useState(printer?.device_id ?? '');
  const [hours, setHours] = useState(field(Math.round((printer?.initial_minutes ?? 0) / 60)));
  const [watts, setWatts] = useState(field(printer?.power_watts));
  const [price, setPrice] = useState(field(printer?.purchase_price));
  const [lifeHours, setLifeHours] = useState(field(printer?.life_hours));
  // Left empty when it was the automatic one, so it follows a new price or life.
  const [hourlyCost, setHourlyCost] = useState(() =>
    printer && printer.purchase_price > 0 && printer.life_hours > 0 && Math.abs(printer.hourly_cost - printer.purchase_price / printer.life_hours) < 0.01
      ? ''
      : field(printer?.hourly_cost),
  );
  const [notes, setNotes] = useState(printer?.notes ?? '');
  const [technology, setTechnology] = useState<'fdm' | 'resin'>(printer?.technology === 'resin' ? 'resin' : 'fdm');
  const resin = technology === 'resin';
  const [consumables, setConsumables] = useState(field(printer?.consumables_per_hour));
  // Helper for the consumables: what each one costs and how many hours it lasts (not saved).
  const [helper, setHelper] = useState(false);
  const [parts, setParts] = useState({ fepPrice: '', fepHours: '200', lcdPrice: '', lcdHours: '2000', alcoholHour: '' });
  const perHour = (cost: string, hoursOf: string) => (num(cost) > 0 && num(hoursOf) > 0 ? num(cost) / num(hoursOf) : 0);
  const helperTotal = Math.round((perHour(parts.fepPrice, parts.fepHours) + perHour(parts.lcdPrice, parts.lcdHours) + num(parts.alcoholHour)) * 100) / 100;
  const autoWear = num(price) > 0 && num(lifeHours) > 0 ? Math.round((num(price) / num(lifeHours)) * 100) / 100 : 0;

  useEffect(() => {
    let current = true;
    supabase
      .from('printer_catalog')
      .select('*')
      .order('brand')
      .order('sort')
      .order('model')
      .then(({ data }) => {
        if (!current) return;
        const rows = (data ?? []) as CatalogPrinter[];
        setCatalog(rows);
        // A printer saved by hand (or before the catalog) opens with its own text.
        if (printer && !rows.some((row) => row.brand === printer.brand)) setOtherBrand(!!printer.brand || !!printer.model);
        else if (printer && !rows.some((row) => row.brand === printer.brand && row.model === printer.model)) setOtherModel(!!printer.model);
      });
    return () => {
      current = false;
    };
  }, [printer]);

  const brands = [...new Set(catalog.map((row) => row.brand))];
  const models = catalog.filter((row) => row.brand === brand);
  const picked = otherBrand || otherModel ? undefined : models.find((row) => row.model === model);

  function chooseBrand(value: string | null) {
    setOtherBrand(value === OTHER);
    setOtherModel(false);
    setBrand(value && value !== OTHER ? value : '');
    setModel('');
  }

  function chooseModel(value: string | null) {
    setOtherModel(value === OTHER);
    setModel(value && value !== OTHER ? value : '');
    const row = models.find((item) => item.model === value);
    if (row && row.power_watts > 0 && !num(watts)) setWatts(field(row.power_watts));
    if (!printer && value && RESIN_MODEL.test(`${brand} ${value}`)) setTechnology('resin');
  }

  function submit() {
    if (!brand.trim()) return setError('Elige o escribe la marca.');
    if (!model.trim()) return setError('Elige o escribe el modelo.');
    const row = {
      name: printerName(brand.trim(), model.trim(), deviceId),
      brand: brand.trim(),
      model: model.trim(),
      device_id: deviceId.trim(),
      catalog_id: picked?.id ?? null,
      initial_minutes: Math.round(num(hours) * 60),
      power_watts: num(watts),
      purchase_price: num(price),
      life_hours: Math.round(num(lifeHours)),
      hourly_cost: hourlyCost === '' ? autoWear : num(hourlyCost),
      // Only once resin is in play, so it saves on databases that do not have the columns yet.
      ...(resin || printer?.technology ? { technology, consumables_per_hour: resin ? num(consumables) : 0 } : {}),
      notes: notes.trim(),
    };
    save(() => (printer ? supabase.from('printers').update(row).eq('id', printer.id) : supabase.from('printers').insert(row)));
  }

  return (
    <Screen>
      <Chips
        label="Tipo"
        options={[
          { value: 'fdm', label: 'Filamento (FDM)' },
          { value: 'resin', label: 'Resina (SLA / MSLA)' },
        ]}
        value={technology}
        onChange={setTechnology}
      />
      <Select
        label="Marca"
        value={otherBrand ? OTHER : brand || null}
        onChange={chooseBrand}
        options={[...brands.map((item) => ({ value: item, label: item })), { value: OTHER, label: 'Otra marca…' }]}
      />
      {otherBrand && <Field label="Escribe la marca" value={brand} onChangeText={setBrand} maxLength={60} />}
      {otherBrand ? (
        <Field label="Modelo" value={model} onChangeText={setModel} maxLength={80} />
      ) : brand ? (
        <>
          <Select
            label="Modelo"
            value={otherModel ? OTHER : model || null}
            onChange={chooseModel}
            options={[...models.map((item) => ({ value: item.model, label: item.model })), { value: OTHER, label: 'Otro modelo…' }]}
          />
          {otherModel && <Field label="Escribe el modelo" value={model} onChangeText={setModel} maxLength={80} />}
        </>
      ) : null}
      <Field
        label="ID o número de serie"
        value={deviceId}
        onChangeText={setDeviceId}
        autoCapitalize="characters"
        maxLength={60}
        hint="Viene en la pantalla de la impresora o en su app. Distingue dos impresoras iguales."
      />
      <Field label="Horas que ya tiene (opcional)" numeric value={hours} onChangeText={setHours} placeholder="0" hint="Se suman a las horas de tus impresiones." />
      <Row style={{ alignItems: 'flex-start' }}>
        <Field style={{ flex: 1 }} label="¿Cuánto te costó?" unit="$" numeric value={price} onChangeText={setPrice} placeholder="0" />
        <Field style={{ flex: 1 }} label="Vida útil" unit="horas" numeric value={lifeHours} onChangeText={setLifeHours} placeholder="5000" />
      </Row>
      <Row style={{ alignItems: 'flex-start' }}>
        <Field
          style={{ flex: 1 }}
          label="Consumo"
          unit="watts"
          numeric
          value={watts}
          onChangeText={setWatts}
          placeholder="0"
          hint="Promedio mientras imprime."
        />
        <Field
          style={{ flex: 1 }}
          label="Desgaste por hora"
          unit="$"
          numeric
          value={hourlyCost}
          onChangeText={setHourlyCost}
          placeholder={autoWear ? autoWear.toFixed(2) : '0'}
          hint={autoWear ? `Vacío usa ${autoWear.toFixed(2)}: lo que costó ÷ su vida útil.` : 'Lo que costó ÷ horas de vida útil.'}
        />
      </Row>
      {resin && (
        <>
          <Field
            label="Consumibles de resina por hora"
            unit="$"
            numeric
            value={consumables}
            onChangeText={setConsumables}
            placeholder="0"
            hint="Alcohol isopropílico, guantes, FEP y pantalla LCD que se gastan por hora de impresión. Se suma al desgaste en el costo de cada pieza."
          />
          <Button variant="secondary" label={helper ? 'Ocultar cálculo' : 'Calcularlo'} onPress={() => setHelper(!helper)} />
          {helper && (
            <Card>
              <Row style={{ alignItems: 'flex-start' }}>
                <Field style={{ flex: 1 }} label="Precio del FEP" unit="$" numeric value={parts.fepPrice} onChangeText={(text) => setParts({ ...parts, fepPrice: text })} />
                <Field style={{ flex: 1 }} label="Le dura" unit="horas" numeric value={parts.fepHours} onChangeText={(text) => setParts({ ...parts, fepHours: text })} />
              </Row>
              <Row style={{ alignItems: 'flex-start' }}>
                <Field style={{ flex: 1 }} label="Pantalla LCD" unit="$" numeric value={parts.lcdPrice} onChangeText={(text) => setParts({ ...parts, lcdPrice: text })} />
                <Field style={{ flex: 1 }} label="Le dura" unit="horas" numeric value={parts.lcdHours} onChangeText={(text) => setParts({ ...parts, lcdHours: text })} />
              </Row>
              <Field
                label="Alcohol y guantes por hora"
                unit="$"
                numeric
                value={parts.alcoholHour}
                onChangeText={(text) => setParts({ ...parts, alcoholHour: text })}
              />
              <Muted>Total: {helperTotal.toFixed(2)} por hora</Muted>
              <Button label="Usar este valor" disabled={!helperTotal} onPress={() => setConsumables(String(helperTotal))} />
            </Card>
          )}
        </>
      )}
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={300} />
      <Muted>Se mostrará como {printerName(brand.trim(), model.trim(), deviceId)}</Muted>

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
      {printer && (
        <Button
          variant="danger"
          icon="trash"
          label="Eliminar impresora"
          disabled={busy}
          onPress={() =>
            confirmDelete(`Se eliminará "${printer.name}" junto con su historial de mantenimientos y ajustes.`, () =>
              save(
                () => supabase.from('printers').delete().eq('id', printer.id),
                () => router.dismissTo('/impresoras'),
              ),
            )
          }
        />
      )}
    </Screen>
  );
}
