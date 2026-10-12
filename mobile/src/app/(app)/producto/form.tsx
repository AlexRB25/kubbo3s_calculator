import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Button, Card, Chips, confirmDelete, ErrorText, Field, Heading, Line, Muted, Row, Screen, Select } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { filamentName, productCost, suggestedPrice, unitProfit } from '@/lib/costs';
import { field, money, num, weight } from '@/lib/format';
import { imageUrl, supabase, uploadProductImage } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';
import { useSession } from '@/store/session';

type RecipeRow = { filament_id: string | null; grams: string };

export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useSession();
  const { products, filaments, printers, channels, profile } = useData();
  const { busy, error, setError, save } = useSave();
  const product = products.find((item) => item.id === id);

  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [hours, setHours] = useState(field(Math.floor((product?.print_minutes ?? 0) / 60)));
  const [minutes, setMinutes] = useState(field((product?.print_minutes ?? 0) % 60));
  const [extraCost, setExtraCost] = useState(field(product?.extra_cost));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [recipe, setRecipe] = useState<RecipeRow[]>(
    product?.filaments.map((use) => ({ filament_id: use.filament_id, grams: String(use.grams) })) ?? [
      { filament_id: null, grams: '' },
    ],
  );
  const [printerIds, setPrinterIds] = useState<string[]>(product?.printer_ids ?? []);
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(product?.prices ?? {}).map(([channel, price]) => [channel, String(price)])),
  );

  const draft = {
    filaments: recipe.flatMap((row) => (row.filament_id && num(row.grams) > 0 ? [{ filament_id: row.filament_id, grams: num(row.grams) }] : [])),
    printer_ids: printerIds,
    print_minutes: Math.round(num(hours) * 60 + num(minutes)),
    extra_cost: num(extraCost),
  };
  const cost = productCost(draft, filaments, printers, profile?.kwh_price ?? 0);

  const setRow = (index: number, change: Partial<RecipeRow>) =>
    setRecipe(recipe.map((row, position) => (position === index ? { ...row, ...change } : row)));

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled) setPhoto(result.assets[0]);
  }

  async function write() {
    let imagePath = product?.image_path ?? null;
    if (photo) {
      const upload = await uploadProductImage(session!.user.id, photo.uri, photo.mimeType);
      if (upload.error) return { error: { message: `No se pudo subir la foto: ${upload.error.message}` } };
      imagePath = upload.path;
    }

    const row = {
      name: name.trim(),
      sku: sku.trim(),
      description: description.trim(),
      image_path: imagePath,
      ...draft,
      prices: Object.fromEntries(Object.entries(prices).flatMap(([channel, price]) => (num(price) > 0 ? [[channel, num(price)]] : []))),
      // Prints and sales move the stock on the server; send it only when it was corrected here.
      ...(product && Math.round(num(stock)) === product.stock ? {} : { stock: Math.round(num(stock)) }),
    };
    const result = product
      ? await supabase.from('products').update(row).eq('id', product.id)
      : await supabase.from('products').insert(row);
    if (!result.error && photo && product?.image_path) {
      await supabase.storage.from('products').remove([product.image_path]);
    }
    return result;
  }

  function submit() {
    if (!name.trim()) return setError('Ponle nombre al producto.');
    if (recipe.some((row) => row.filament_id && num(row.grams) <= 0)) return setError('Indica cuántos gramos consume cada filamento.');
    save(write);
  }

  function remove() {
    confirmDelete(`Se eliminará "${product!.name}". Sus impresiones y ventas se conservan en el historial.`, () =>
      save(
        async () => {
          const result = await supabase.from('products').delete().eq('id', product!.id);
          if (!result.error && product!.image_path) await supabase.storage.from('products').remove([product!.image_path]);
          return result;
        },
        () => router.dismissTo('/productos'),
      ),
    );
  }

  const preview = photo?.uri ?? imageUrl(product?.image_path ?? null);

  return (
    <Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="Elegir foto del producto" onPress={pickPhoto} style={styles.photo}>
        {preview ? (
          <Image source={preview} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <>
            <Ionicons name="camera" size={32} color={Colors.textSecondary} />
            <Muted>Agregar foto</Muted>
          </>
        )}
      </Pressable>

      <Field label="Nombre" value={name} onChangeText={setName} maxLength={80} />
      <Field label="SKU o clave" value={sku} onChangeText={setSku} autoCapitalize="characters" maxLength={40} />
      <Field label="Descripción" value={description} onChangeText={setDescription} multiline maxLength={500} />

      <Heading>Filamento por pieza</Heading>
      {recipe.map((row, index) => (
        <Row key={index} style={{ alignItems: 'flex-end' }}>
          <Select
            style={{ flex: 2 }}
            label="Filamento"
            value={row.filament_id}
            onChange={(filament_id) => setRow(index, { filament_id })}
            options={filaments.map((filament) => ({
              value: filament.id,
              label: filamentName(filament),
              hint: `${weight(filament.stock_g)} · ${money(filament.cost_per_kg)}/kg`,
            }))}
          />
          <Field style={{ flex: 1 }} label="Gramos" numeric value={row.grams} onChangeText={(grams) => setRow(index, { grams })} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quitar filamento"
            hitSlop={8}
            onPress={() => setRecipe(recipe.filter((_, position) => position !== index))}
            style={{ paddingBottom: Spacing.three }}>
            <Ionicons name="close-circle" size={22} color={Colors.textSecondary} />
          </Pressable>
        </Row>
      ))}
      <Button
        variant="secondary"
        icon="add"
        label="Agregar otro filamento"
        onPress={() => setRecipe([...recipe, { filament_id: null, grams: '' }])}
      />
      {filaments.length === 0 && <Muted>Aún no tienes filamentos: regístralos en la pestaña Filamento para calcular el costo.</Muted>}

      <Heading>Impresión</Heading>
      <Row>
        <Field style={{ flex: 1 }} label="Horas" numeric value={hours} onChangeText={setHours} placeholder="0" />
        <Field style={{ flex: 1 }} label="Minutos" numeric value={minutes} onChangeText={setMinutes} placeholder="0" />
      </Row>
      {printers.length > 0 ? (
        <Chips
          label="Máquinas en las que sale"
          options={printers.map((printer) => ({ value: printer.id, label: printer.name }))}
          value={printerIds}
          onChange={(printer) =>
            setPrinterIds(printerIds.includes(printer) ? printerIds.filter((item) => item !== printer) : [...printerIds, printer])
          }
        />
      ) : (
        <Muted>Da de alta tus impresoras en Más → Impresoras para sumar luz y desgaste al costo.</Muted>
      )}
      <Field
        label="Otros costos por pieza"
        unit="$"
        numeric
        value={extraCost}
        onChangeText={setExtraCost}
        placeholder="0"
        hint="Empaque, tornillos, imanes, etiquetas…"
      />

      <Card>
        <Line label="Filamento" value={money(cost.filament)} />
        <Line label="Luz" value={money(cost.electricity)} />
        <Line label="Desgaste de máquina" value={money(cost.machine)} />
        <Line label="Otros" value={money(cost.extra)} />
        <Line strong label="Costo por pieza" value={money(cost.total)} />
      </Card>

      <Heading>Precio de venta</Heading>
      {channels.map((channel) => {
        const price = num(prices[channel.id] ?? '');
        return (
          <Field
            key={channel.id}
            label={channel.name}
            unit="$"
            numeric
            value={prices[channel.id] ?? ''}
            onChangeText={(text) => setPrices({ ...prices, [channel.id]: text })}
            placeholder={`Sugerido ${suggestedPrice(cost.total, channel, profile?.margin_pct ?? 0).toFixed(2)}`}
            hint={price > 0 ? `Ganas ${money(unitProfit(price, cost.total, channel))} por pieza` : undefined}
          />
        );
      })}

      <Field
        label="Piezas en stock"
        numeric
        value={stock}
        onChangeText={setStock}
        hint="Sube con cada impresión terminada y baja con cada venta. Cámbialo solo para corregirlo."
      />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
      {product && <Button variant="danger" icon="trash" label="Eliminar producto" onPress={remove} disabled={busy} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: Radius.medium,
    borderColor: Colors.border,
    borderWidth: 1,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
});
