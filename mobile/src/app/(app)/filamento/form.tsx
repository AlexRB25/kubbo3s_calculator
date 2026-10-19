import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chips, confirmDelete, ErrorText, Field, Line, Muted, Row, Screen, Select } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { field, num, weight } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

const MATERIALS = ['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Resina'];

const SWATCHES = [
  '#FFFFFF', '#111111', '#9AA7AD', '#E53935', '#FF6B2C', '#F5B83D', '#FFEB3B',
  '#34D399', '#1B8A5A', '#38BDF8', '#2563EB', '#8B5CF6', '#EC4899', '#8D5A3B',
];

export default function FilamentFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { filaments, suppliers } = useData();
  const { busy, error, setError, save } = useSave();
  const filament = filaments.find((item) => item.id === id);

  const [material, setMaterial] = useState(filament?.material ?? 'PLA');
  const [brand, setBrand] = useState(filament?.brand ?? '');
  const [color, setColor] = useState(filament?.color ?? '');
  const [colorHex, setColorHex] = useState(filament?.color_hex ?? SWATCHES[0]);
  const [supplierId, setSupplierId] = useState(filament?.supplier_id ?? null);
  const [stock, setStock] = useState(field(filament?.stock_g));
  const [costPerKg, setCostPerKg] = useState(field(filament?.cost_per_kg));
  const [lowStock, setLowStock] = useState(String(filament?.low_stock_g ?? 200));
  const [notes, setNotes] = useState(filament?.notes ?? '');

  function submit() {
    if (!material.trim()) return setError('Indica el material.');
    const row = {
      material: material.trim(),
      brand: brand.trim(),
      color: color.trim(),
      color_hex: colorHex,
      supplier_id: supplierId,
      cost_per_kg: num(costPerKg),
      low_stock_g: num(lowStock),
      notes: notes.trim(),
      // Stock is typed only for a new filament; later purchases, prints and arqueos move it.
      ...(filament ? {} : { stock_g: num(stock) }),
    };
    save(() => (filament ? supabase.from('filaments').update(row).eq('id', filament.id) : supabase.from('filaments').insert(row)));
  }

  return (
    <Screen>
      {filament && (
        <Button
          variant="money"
          icon="cart"
          label="Registrar compra"
          onPress={() => router.push({ pathname: '/filamento/compra', params: { id: filament.id } })}
        />
      )}

      <Field label="Material" value={material} onChangeText={setMaterial} autoCapitalize="characters" maxLength={30} />
      <Chips options={MATERIALS.map((item) => ({ value: item, label: item }))} value={material} onChange={setMaterial} />
      <Row>
        <Field style={{ flex: 1 }} label="Color" value={color} onChangeText={setColor} placeholder="Negro mate" maxLength={40} />
        <Field style={{ flex: 1 }} label="Marca" value={brand} onChangeText={setBrand} maxLength={40} />
      </Row>

      <View style={{ gap: Spacing.one }}>
        <Text style={styles.label}>Color en las listas</Text>
        <View style={styles.swatches}>
          {SWATCHES.map((swatch) => (
            <Pressable
              key={swatch}
              accessibilityRole="radio"
              accessibilityLabel={`Color ${swatch}`}
              accessibilityState={{ selected: swatch === colorHex }}
              onPress={() => setColorHex(swatch)}
              style={[styles.swatch, { backgroundColor: swatch }, swatch === colorHex && styles.swatchSelected]}
            />
          ))}
        </View>
      </View>

      {filament ? (
        <Card>
          <Line label="En existencia" value={weight(filament.stock_g)} strong />
          <Muted>Sube con las compras y baja con las impresiones. Para corregirla, arquéala.</Muted>
          <Button
            label="Arquear"
            variant="secondary"
            onPress={() => router.push({ pathname: '/inventario/arqueo', params: { type: 'filament', id: filament.id } })}
          />
        </Card>
      ) : (
        <Field label="Existencia inicial" unit="g" numeric value={stock} onChangeText={setStock} placeholder="1000" hint="Lo que ya tienes; queda en el historial." />
      )}
      <Field
        label="Costo de referencia por kg"
        unit="$"
        numeric
        value={costPerKg}
        onChangeText={setCostPerKg}
        placeholder="0"
        hint="Lo que normalmente cuesta. El costo real por gramo sale de tus compras."
      />
      <Field
        label="Avisarme al bajar de"
        unit="g"
        numeric
        value={lowStock}
        onChangeText={setLowStock}
        hint={filament ? 'Las impresiones descuentan y las compras suman solas; cambia la existencia solo para corregirla.' : undefined}
      />
      <Select
        label="Proveedor"
        value={supplierId}
        onChange={setSupplierId}
        none="Sin proveedor"
        options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
      />
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={300} placeholder="Temperaturas, secado…" />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
      {filament && (
        <Button
          variant="danger"
          icon="trash"
          label="Eliminar filamento"
          disabled={busy}
          onPress={() =>
            confirmDelete('El historial de impresiones y compras se conserva, pero los productos que lo usan dejarán de sumar su costo.', () =>
              save(() => supabase.from('filaments').delete().eq('id', filament.id)),
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  swatch: { width: 36, height: 36, borderRadius: Radius.pill, borderWidth: 2, borderColor: Colors.border },
  swatchSelected: { borderColor: Colors.accent, borderWidth: 3 },
});
