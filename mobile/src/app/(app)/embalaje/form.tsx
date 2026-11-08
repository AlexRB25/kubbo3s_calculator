import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { BoxPreview } from '@/components/box-preview';
import { Button, Chips, confirmDelete, ErrorText, Field, Row, Screen } from '@/components/ui';
import { field, num } from '@/lib/format';
import { PACKAGING_KINDS } from '@/lib/labels';
import { supabase } from '@/lib/supabase';
import type { BoxMaterial, BoxStyle, PackagingKind } from '@/lib/types';
import { useData, useSave } from '@/store/data';

export default function PackagingFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { packaging, profile } = useData();
  // The 3D shape came with the same database update as the clients.
  const withShapes = profile?.client_fields !== undefined;
  const { busy, error, setError, save } = useSave();
  const item = packaging.find((entry) => entry.id === id);

  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState<PackagingKind>(item?.kind ?? 'box');
  // Measures are typed in centimetres and stored in millimetres.
  const [length, setLength] = useState(field(item ? item.length_mm / 10 : 0));
  const [width, setWidth] = useState(field(item ? item.width_mm / 10 : 0));
  const [height, setHeight] = useState(field(item ? item.height_mm / 10 : 0));
  const [cost, setCost] = useState(field(item?.cost));
  const [stock, setStock] = useState(field(item?.stock));
  const [weight, setWeight] = useState(field(item?.weight_g));
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [style, setStyle] = useState<BoxStyle>(item?.style ?? 'rsc');
  const [material, setMaterial] = useState<BoxMaterial>(item?.material ?? 'kraft');

  function submit() {
    if (!name.trim()) return setError('Ponle nombre al embalaje.');
    const row = {
      name: name.trim(),
      kind,
      length_mm: num(length) * 10,
      width_mm: num(width) * 10,
      height_mm: num(height) * 10,
      cost: num(cost),
      stock: Math.round(num(stock)),
      weight_g: num(weight),
      notes: notes.trim(),
      ...(withShapes ? { style, material } : {}),
    };
    save(() => (item ? supabase.from('packaging').update(row).eq('id', item.id) : supabase.from('packaging').insert(row)));
  }

  return (
    <Screen>
      {kind === 'box' && num(length) > 0 && num(width) > 0 && num(height) > 0 && (
        <BoxPreview box={{ length_mm: num(length) * 10, width_mm: num(width) * 10, height_mm: num(height) * 10, style, material }} size={200} />
      )}
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Caja chica kraft" maxLength={60} />
      <Chips label="Tipo" options={PACKAGING_KINDS} value={kind} onChange={setKind} />
      {withShapes && kind === 'box' && (
        <>
          <Chips
            label="Forma"
            options={[
              { value: 'rsc', label: 'De envío (4 solapas)' },
              { value: 'mailer', label: 'Con tapa (maletín)' },
            ]}
            value={style}
            onChange={setStyle}
          />
          <Chips
            label="Color"
            options={[
              { value: 'kraft', label: 'Kraft' },
              { value: 'blanca', label: 'Blanca' },
              { value: 'negra', label: 'Negra' },
            ]}
            value={material}
            onChange={setMaterial}
          />
        </>
      )}
      <Row>
        <Field style={{ flex: 1 }} label="Largo" unit="cm" numeric value={length} onChangeText={setLength} placeholder="0" />
        <Field style={{ flex: 1 }} label="Ancho" unit="cm" numeric value={width} onChangeText={setWidth} placeholder="0" />
        <Field style={{ flex: 1 }} label="Alto" unit="cm" numeric value={height} onChangeText={setHeight} placeholder="0" />
      </Row>
      <Field
        label="Costo por pieza"
        unit="$"
        numeric
        value={cost}
        onChangeText={setCost}
        placeholder="0"
        hint="Incluye relleno, cinta o etiqueta si los usas con este empaque."
      />
      <Row style={{ alignItems: 'flex-start' }}>
        <Field
          style={{ flex: 1 }}
          label="Piezas que tienes"
          numeric
          value={stock}
          onChangeText={setStock}
          placeholder="0"
          hint="Baja una con cada venta con envío."
        />
        <Field style={{ flex: 1 }} label="Peso del empaque" unit="g" numeric value={weight} onChangeText={setWeight} placeholder="0" hint="Vacío." />
      </Row>
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={300} placeholder="Proveedor, para qué productos sirve…" />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
      {item && (
        <Button
          variant="danger"
          icon="trash"
          label="Eliminar embalaje"
          disabled={busy}
          onPress={() =>
            confirmDelete(`Se eliminará "${item.name}". Los productos que lo usan quedarán sin embalaje.`, () =>
              save(() => supabase.from('packaging').delete().eq('id', item.id)),
            )
          }
        />
      )}
    </Screen>
  );
}
