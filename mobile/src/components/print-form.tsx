import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Button, Chips, confirmDelete, ErrorText, Field, Heading, Muted, Row, Screen, Select } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { filamentName, recipeFor } from '@/lib/costs';
import { duration, num, weight } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { PrintJob, PrintStatus, Product } from '@/lib/types';
import { useData, useSave } from '@/store/data';

type UseRow = { filament_id: string | null; grams: string };

const STATUSES: { value: PrintStatus; label: string }[] = [
  { value: 'printing', label: 'Imprimiendo' },
  { value: 'done', label: 'Terminada' },
  { value: 'failed', label: 'Falló' },
];

const recipeRows = (product: Product | undefined): UseRow[] =>
  product?.filaments.length ? product.filaments.map((use) => ({ filament_id: use.filament_id, grams: '' })) : [{ filament_id: null, grams: '' }];

/**
 * Sends something to print, or corrects / finishes an existing print (`job`). Empty fields
 * fall back to what the product's recipe says, shown as the placeholder.
 */
export function PrintForm({ job, productId: initialProduct }: { job?: PrintJob; productId?: string }) {
  const { products, printers, filaments } = useData();
  const { busy, error, setError, save } = useSave();

  const [productId, setProductId] = useState<string | null>(job ? job.product_id : (initialProduct ?? null));
  const product = products.find((item) => item.id === productId);
  const [customName, setCustomName] = useState(job && !job.product_id ? job.product_name : '');
  const [printerId, setPrinterId] = useState<string | null>(job ? job.printer_id : (product?.printer_ids[0] ?? null));
  const [quantity, setQuantity] = useState(String(job?.quantity ?? 1));
  const [status, setStatus] = useState<PrintStatus>(job?.status ?? 'printing');
  const [good, setGood] = useState(job?.status === 'done' ? String(job.good_quantity) : '');
  const [minutes, setMinutes] = useState(job ? String(job.minutes) : '');
  const [notes, setNotes] = useState(job?.notes ?? '');
  const [rows, setRows] = useState<UseRow[]>(
    job
      ? job.print_job_filaments.flatMap((use) => (use.filament_id ? [{ filament_id: use.filament_id, grams: String(use.grams) }] : []))
      : recipeRows(product),
  );

  const pieces = Math.max(Math.round(num(quantity)), 0);
  // What the product takes on the chosen printer: the sum of its plates there.
  const recipe = product ? recipeFor(product, printerId) : { filaments: [], minutes: 0 };
  const recipeGrams = (filamentId: string | null) =>
    (recipe.filaments.find((use) => use.filament_id === filamentId)?.grams ?? 0) * pieces;
  const recipeMinutes = recipe.minutes * pieces;

  function chooseProduct(next: string | null) {
    const chosen = products.find((item) => item.id === next);
    setProductId(next);
    setRows(recipeRows(chosen));
    if (chosen?.printer_ids.length && !chosen.printer_ids.includes(printerId ?? '')) setPrinterId(chosen.printer_ids[0]);
  }

  const setRow = (index: number, change: Partial<UseRow>) =>
    setRows(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));

  function submit() {
    const name = product?.name ?? customName.trim();
    if (!name) return setError('Elige un producto o escribe qué vas a imprimir.');
    if (pieces < 1) return setError('Indica cuántas piezas son.');
    const goodPieces = status === 'done' ? (good === '' ? pieces : Math.round(num(good))) : 0;
    if (goodPieces > pieces) return setError('No pueden salir más piezas buenas de las que mandaste a imprimir.');

    save(() =>
      supabase.rpc('save_print', {
        p_id: job?.id ?? null,
        p_product: productId,
        p_name: name,
        p_printer: printerId,
        p_quantity: pieces,
        p_good: goodPieces,
        p_status: status,
        p_minutes: minutes === '' ? recipeMinutes : Math.round(num(minutes)),
        p_notes: notes.trim(),
        p_filaments: rows.flatMap((row) =>
          row.filament_id ? [{ filament_id: row.filament_id, grams: row.grams === '' ? recipeGrams(row.filament_id) : num(row.grams) }] : [],
        ),
      }),
    );
  }

  return (
    <Screen>
      <Select
        label="Producto"
        value={productId}
        onChange={chooseProduct}
        none="Otra cosa (sin producto)"
        options={products.map((item) => ({ value: item.id, label: item.name, hint: `${item.stock} en stock` }))}
      />
      {!product && <Field label="¿Qué vas a imprimir?" value={customName} onChangeText={setCustomName} maxLength={80} />}
      <Row>
        <Field style={{ flex: 1 }} label="Piezas" numeric value={quantity} onChangeText={setQuantity} />
        <Field
          style={{ flex: 1 }}
          label="Tiempo"
          unit="min"
          numeric
          value={minutes}
          onChangeText={setMinutes}
          placeholder={String(recipeMinutes)}
        />
      </Row>
      {minutes === '' && recipeMinutes > 0 && <Muted>Según el producto: {duration(recipeMinutes)}.</Muted>}
      <Select
        label="Impresora"
        value={printerId}
        onChange={setPrinterId}
        none="Sin impresora"
        options={printers.map((printer) => ({ value: printer.id, label: printer.name }))}
      />

      <Heading>Filamento consumido</Heading>
      {rows.map((row, index) => {
        const filament = filaments.find((item) => item.id === row.filament_id);
        return (
          <Row key={index} style={{ alignItems: 'flex-start' }}>
            <Select
              style={{ flex: 2 }}
              label="Filamento"
              value={row.filament_id}
              onChange={(filament_id) => setRow(index, { filament_id })}
              options={filaments.map((item) => ({ value: item.id, label: filamentName(item), hint: `Quedan ${weight(item.stock_g)}` }))}
            />
            <Field
              style={{ flex: 1 }}
              label="Gramos"
              numeric
              value={row.grams}
              onChangeText={(grams) => setRow(index, { grams })}
              placeholder={String(recipeGrams(row.filament_id))}
              hint={filament ? `Quedan ${weight(filament.stock_g)}` : undefined}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quitar filamento"
              hitSlop={8}
              onPress={() => setRows(rows.filter((_, position) => position !== index))}
              style={{ paddingTop: Spacing.five }}>
              <Ionicons name="close-circle" size={22} color={Colors.textSecondary} />
            </Pressable>
          </Row>
        );
      })}
      <Button variant="secondary" icon="add" label="Agregar otro filamento" onPress={() => setRows([...rows, { filament_id: null, grams: '' }])} />
      <Muted>El filamento se descuenta al guardar, aunque la impresión siga en curso o haya fallado.</Muted>

      <Chips label="Estado" options={STATUSES} value={status} onChange={setStatus} />
      {status === 'done' && (
        <Field
          label="Piezas buenas"
          numeric
          value={good}
          onChangeText={setGood}
          placeholder={String(pieces)}
          hint={product ? 'Entran al stock del producto.' : undefined}
        />
      )}
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={300} />

      <ErrorText>{error}</ErrorText>
      <Button label={job ? 'Guardar cambios' : 'Registrar impresión'} onPress={submit} loading={busy} />
      {job && (
        <Button
          variant="danger"
          icon="trash"
          label="Eliminar impresión"
          disabled={busy}
          onPress={() =>
            confirmDelete('El filamento vuelve a tu inventario y las piezas salen del stock.', () =>
              save(() => supabase.from('print_jobs').delete().eq('id', job.id), router.back),
            )
          }
        />
      )}
    </Screen>
  );
}
