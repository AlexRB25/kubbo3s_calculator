import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';

import { Button, Card, ErrorText, Heading, ListItem, Muted, Screen } from '@/components/ui';
import { isLink, parseImport, productFields, templateSheets, type ImportRow } from '@/lib/product-import';
import { supabase, uploadProductImage } from '@/lib/supabase';
import { readTable, writeXlsx } from '@/lib/xlsx';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';

/** Quick load of products from an Excel (or CSV) sheet, like the web's «Carga rápida». Photos only by link here. */
export default function ProductImportScreen() {
  const { products, channels, shop, reload } = useData();
  const { session } = useSession();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState<{ created: number; updated: number; notes: string[] } | null>(null);
  const valid = rows.filter((row) => !row.error);
  const named = rows.reduce((total, row) => total + row.photos.filter((photo) => !isLink(photo)).length, 0);

  async function shareTemplate() {
    setError('');
    try {
      const file = new File(Paths.cache, 'plantilla-productos-kubbo3d.xlsx');
      if (file.exists) file.delete();
      file.write(writeXlsx(templateSheets(channels)));
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          UTI: 'org.openxmlformats.spreadsheetml.sheet',
          dialogTitle: 'Plantilla de productos',
        });
      else setError('Este teléfono no permite compartir archivos.');
    } catch {
      setError('No se pudo crear la plantilla.');
    }
  }

  async function pickSheet() {
    setError('');
    setReport(null);
    try {
      const picked = await File.pickFileAsync();
      if (picked.canceled) return;
      const file = picked.result;
      const parsed = parseImport(readTable(new Uint8Array(await file.arrayBuffer())), channels, products);
      setFileName(file.name);
      setRows(parsed.rows);
      if (parsed.error) setError(parsed.error);
    } catch {
      setRows([]);
      setError('No pude leer el archivo. Guárdalo como Excel (.xlsx) o CSV e inténtalo de nuevo.');
    }
  }

  async function run() {
    if (!session) return;
    const owner = shop?.shop_id ?? session.user.id;
    const notes: string[] = [];
    let created = 0;
    let updated = 0;
    for (const [index, row] of valid.entries()) {
      setBusy(`Producto ${index + 1} de ${valid.length}…`);
      const paths: string[] = [];
      for (const entry of row.photos) {
        if (!isLink(entry)) {
          notes.push(`Fila ${row.line}: ${entry} es un archivo; en la app solo se cargan fotos por enlace (súbela desde la web o agrégala en el producto).`);
          continue;
        }
        try {
          const upload = await uploadProductImage(owner, entry);
          if (upload.error) notes.push(`Fila ${row.line}: no se pudo subir ${entry}.`);
          else paths.push(upload.path);
        } catch {
          notes.push(`Fila ${row.line}: no se pudo descargar ${entry}.`);
        }
      }
      const existing = products.find((product) => product.id === row.existingId);
      const fields = productFields(row, paths, existing);
      const result = existing ? await supabase.from('products').update(fields).eq('id', existing.id) : await supabase.from('products').insert(fields);
      if (result.error) notes.push(`Fila ${row.line}: no se guardó (${result.error.message}).`);
      else if (existing) updated++;
      else created++;
    }
    for (const row of rows.filter((item) => item.error)) notes.push(`Fila ${row.line}: se saltó (${row.error}).`);
    await reload();
    setBusy('');
    setRows([]);
    setFileName('');
    setReport({ created, updated, notes });
  }

  return (
    <Screen>
      <Muted>
        1. Comparte la plantilla a tu correo o Drive y llena una fila por producto. 2. Súbela aquí. 3. Revisa y dale Importar. Los productos con el mismo SKU (o nombre) se
        actualizan, no se duplican.
      </Muted>
      <Button variant="secondary" icon="download" label="Descargar plantilla" onPress={shareTemplate} disabled={!!busy} />
      <Button icon="document-attach" label={fileName ? 'Cambiar archivo' : 'Subir Excel o CSV'} onPress={pickSheet} disabled={!!busy} />
      {fileName ? <Muted>Archivo: {fileName}</Muted> : null}
      {named > 0 && <Muted>En la app solo se cargan fotos con enlace https://. Las fotos por nombre de archivo súbelas desde la web.</Muted>}
      <ErrorText>{error}</ErrorText>

      {rows.length > 0 && (
        <>
          <Heading>{`${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}`}</Heading>
          {rows.map((row) => (
            <ListItem
              key={row.line}
              title={`${row.line}. ${row.name ?? '(sin cambio de nombre)'}`}
              subtitle={[row.sku, row.categories?.join(', '), row.photos.length ? `${row.photos.length} fotos` : ''].filter(Boolean).join(' · ')}
              value={row.error ? 'Se salta' : row.existingId ? 'Actualiza' : 'Nuevo'}
              valueHint={row.error}
              tone={row.error ? 'bad' : row.existingId ? undefined : 'good'}
            />
          ))}
          <Button label={busy || `Importar ${valid.length} ${valid.length === 1 ? 'producto' : 'productos'}`} onPress={run} loading={!!busy} disabled={!valid.length} />
        </>
      )}

      {report && (
        <Card>
          <Heading>{`Listo: ${report.created} nuevos y ${report.updated} actualizados`}</Heading>
          <Muted>Para que calcule su costo, abre cada uno y en la pestaña Impresión elige sus filamentos e impresoras.</Muted>
          {report.notes.map((note) => (
            <ErrorText key={note}>{note}</ErrorText>
          ))}
        </Card>
      )}
    </Screen>
  );
}
