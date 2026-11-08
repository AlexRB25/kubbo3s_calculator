import { File, Paths } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Card, Chips, Empty, ErrorText, Field, Heading, ListItem, Muted, Screen } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { SCAN_FORMATS, SCAN_MAX_BYTES, SCAN_STATUS, type ScanBalance, type ScanItem } from '@/lib/scan';
import { takeScanPhotos, type ScanPhoto } from '@/lib/scan-capture';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/store/session';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://calculator.kubbo3d.com').replace(/\/$/, '');

async function bearer() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

/** Scan an object with photos or a video (KIRI Engine photogrammetry, sent by Kubbo3D's server). */
export default function ScannerScreen() {
  const { session } = useSession();
  const [balance, setBalance] = useState<ScanBalance | null>(null);
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] = useState('stl');
  const [files, setFiles] = useState<ScanPhoto[]>([]);

  const load = useCallback(async () => {
    const mine = await supabase.rpc('scan_balance');
    if (mine.error) setError(mine.error.code === 'PGRST202' ? 'El escáner todavía no está disponible.' : mine.error.message);
    else setBalance(mine.data as ScanBalance);
    const status = await fetch(`${WEB_URL}/api/escaner/estado`, { headers: await bearer() })
      .then((response) => response.json())
      .catch(() => null);
    if (status?.scans) setScans(status.scans);
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  // While a scan is being processed, ask again every 20 seconds.
  const working = scans.some((scan) => ['uploading', 'queued', 'processing'].includes(scan.status));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [working, load]);

  // Photos coming back from the guided camera.
  useFocusEffect(
    useCallback(() => {
      const taken = takeScanPhotos();
      if (!taken) return;
      setError('');
      setFiles(
        taken.map((photo) => {
          try {
            return { ...photo, size: new File(photo.uri).size ?? 0 };
          } catch {
            return photo;
          }
        }),
      );
    }, []),
  );

  async function scan() {
    setError('');
    if (files.length < 20 || files.length > 300) return setError(`Se necesitan de 20 a 300 fotos (llevas ${files.length}).`);
    if (files.reduce((sum, file) => sum + file.size, 0) > SCAN_MAX_BYTES) return setError('Las fotos pesan más de 250 MB: escanea de nuevo con menos fotos.');
    setBusy('Apartando tu escaneo…');
    const claimed = await supabase.rpc('claim_scan', { p_name: name.trim() || 'Escaneo', p_kind: 'photos', p_format: format });
    if (claimed.error) {
      setBusy('');
      return setError(claimed.error.message);
    }
    const id = claimed.data as string;
    try {
      for (let index = 0; index < files.length; index++) {
        setBusy(`Subiendo ${index + 1} de ${files.length}…`);
        const file = files[index];
        const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const bytes = await new File(file.uri).bytes();
        const uploaded = await supabase.storage
          .from('scans')
          .upload(`${session?.user.id}/${id}/in/${String(index + 1).padStart(4, '0')}.${extension}`, bytes, { contentType: file.mime });
        if (uploaded.error) throw new Error(uploaded.error.message);
      }
      setBusy('Enviando a procesar…');
      const response = await fetch(`${WEB_URL}/api/escaner/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await bearer()) },
        body: JSON.stringify({ scan_id: id }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.scan?.error ?? body?.error ?? 'No se pudo enviar el escaneo.');
      setFiles([]);
      setName('');
      Alert.alert('¡Listo!', 'Tu escaneo se está procesando. Tarda de 10 a 60 minutos; puedes cerrar la app y volver.');
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : 'No se pudo subir.'} El escaneo no se te cobra.`);
    } finally {
      setBusy('');
      load();
    }
  }

  async function download(item: ScanItem) {
    if (!item.url) return;
    setBusy('Descargando el modelo…');
    try {
      const target = new File(Paths.cache, `${(item.name || 'escaneo').replace(/[^\w-]+/g, '-')}-${item.file_format}.zip`);
      if (target.exists) target.delete();
      const file = await File.downloadFileAsync(item.url, target);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: item.name });
    } catch {
      setError('No se pudo descargar el modelo.');
    } finally {
      setBusy('');
    }
  }

  const left = balance ? balance.plan_left + balance.pack_left : 0;
  const tone = { warn: 'warn', good: 'good', bad: 'bad', muted: undefined } as const;

  return (
    <Screen>
      <Muted>Rodea un objeto con tu cámara y conviértelo en un modelo 3D para imprimir, copiar o modificar.</Muted>
      <ErrorText>{error}</ErrorText>

      {balance && (
        <Card>
          <Heading>Tus escaneos</Heading>
          <Text style={{ color: Colors.accent, fontSize: 40, fontWeight: '900' }}>{left}</Text>
          <Muted>
            {balance.plan_scans > 0 ? `${balance.plan_left} de ${balance.plan_scans} de tu plan este mes` : 'Tu plan no incluye escaneos al mes'}
            {balance.pack_left > 0 ? ` · ${balance.pack_left} de paquetes (no vencen)` : ''}
          </Muted>
          {!balance.active && <Muted>Para escanear necesitas una suscripción activa.</Muted>}
          {balance.active && left === 0 && <Muted>Ya no te quedan escaneos este mes.</Muted>}
        </Card>
      )}

      {balance?.active && left > 0 && (
        <Card>
          <Heading>Nuevo escaneo</Heading>
          <Field label="Nombre" value={name} onChangeText={setName} placeholder="Figura de mi abuela" />
          <Chips label="Formato del modelo" options={SCAN_FORMATS} value={format} onChange={setFormat} />
          <Button
            variant={files.length ? 'secondary' : 'primary'}
            icon="camera"
            label={files.length ? `${files.length} fotos tomadas · volver a escanear` : 'Abrir la cámara y escanear'}
            onPress={() => router.push('/escaner-camara')}
          />
          <Muted>La cámara te va guiando: te dice hacia dónde girar, si vas muy rápido o si falta luz, y toma las fotos sola.</Muted>
          <Button icon="scan" label={busy || (files.length ? 'Enviar a procesar (usa 1 escaneo)' : 'Primero toma las fotos')} loading={!!busy} disabled={!files.length} onPress={scan} />
        </Card>
      )}

      <Heading>Mis escaneos</Heading>
      {scans.length === 0 ? (
        <Empty icon="scan" text="Aquí aparecen tus escaneos. Procesar uno tarda de 10 a 60 minutos." />
      ) : (
        scans.map((item) => (
          <ListItem
            key={item.id}
            title={item.name || 'Escaneo'}
            subtitle={[new Date(item.created_at).toLocaleDateString('es-MX'), item.file_format.toUpperCase(), item.error].filter(Boolean).join(' · ')}
            value={SCAN_STATUS[item.status]?.label ?? item.status}
            valueHint={item.url ? 'Toca para descargar' : undefined}
            tone={tone[SCAN_STATUS[item.status]?.tone ?? 'muted']}
            onPress={item.url ? () => download(item) : undefined}
          />
        ))
      )}
    </Screen>
  );
}
