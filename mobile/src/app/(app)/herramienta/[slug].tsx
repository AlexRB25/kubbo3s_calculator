import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { ToolEngineView, type ToolEngine } from '@/components/tool-engine';
import { Button, Card, Chips, Empty, ErrorText, Field, Muted, Row, Screen, Select } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import CATALOG from '@/lib/tools-catalog.json';

type Params = Record<string, number | string | boolean>;
type Option = { value: string; label: string };
type FieldDef =
  | { key: string; label: string; type: 'number'; min: number; max: number; step: number; unit?: string; hint?: string }
  | { key: string; label: string; type: 'select'; options: Option[]; hint?: string }
  | { key: string; label: string; type: 'checkbox'; hint?: string };
type ToolInfo = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  images: boolean;
  imagesOnly: boolean;
  multiple: boolean;
  defaults: Params;
  fields: FieldDef[];
};

type Opened = { name: string; size?: number[]; triangles?: number; image?: boolean } | null;
type ResultPiece = { name: string; size: number[]; color: string | null; extra: boolean };

/** Modes that need clicking, cutting or painting on the model: the app offers them in a next version. */
const LATER: Record<string, string[]> = { partir: ['knife', 'paint', 'region', 'colors'] };

const mm = (size?: number[]) => (size ? `${size.map((value) => Math.round(value * 10) / 10).join(' × ')} mm` : '');

/** A random id for a result (claim_download counts each result once). */
const resultId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

export default function ToolScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const tool = (CATALOG as unknown as ToolInfo[]).find((item) => item.slug === slug);
  const engine = useRef<ToolEngine>(null);
  const [ready, setReady] = useState(false);
  const [params, setParams] = useState<Params>(() => ({ ...(tool?.defaults ?? {}) }));
  const [visible, setVisible] = useState<string[] | null>(null);
  const [opened, setOpened] = useState<Opened>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [scale, setScale] = useState('100');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pieces, setPieces] = useState<ResultPiece[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [result, setResult] = useState<{ id: string; claimed: boolean } | null>(null);

  // Which fields show depends on the others (the engine knows the rules of each tool).
  useEffect(() => {
    if (!ready || !tool) return;
    let current = true;
    engine.current
      ?.call<{ keys: string[] }>('visible', { slug: tool.slug, params })
      .then((answer) => current && setVisible(answer.keys))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [ready, tool, params]);

  if (!tool) return <Empty icon="construct" text="Esta herramienta todavía no está en la app." />;

  const has = Boolean(opened) || sources.length > 0;
  const set = (key: string, value: number | string | boolean) => {
    setParams((current) => ({ ...current, [key]: value }));
    setPieces(null);
  };

  async function openFiles(files: { uri: string; name: string }[]) {
    if (!engine.current || !tool) return;
    setError('');
    setBusy(files.length > 1 ? `Leyendo ${files.length} archivos…` : `Leyendo ${files[0].name}…`);
    try {
      const sent = [];
      for (const file of files) sent.push({ uri: await engine.current.send(file.uri), name: file.name });
      const answer = await engine.current.call<{ name?: string; size?: number[]; triangles?: number; image?: boolean; sources?: { name: string }[] }>('open', {
        slug: tool.slug,
        files: sent,
      });
      if (tool.multiple) setSources((answer.sources ?? []).map((source) => source.name));
      else setOpened({ name: answer.name ?? files[0].name, size: answer.size, triangles: answer.triangles, image: answer.image });
      setPieces(null);
      setScale('100');
      // An image in the Lámpara can only be a light box (same as the website).
      if (tool.slug === 'lampara') set('kind', answer.image ? 'lightbox' : 'shade');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo leer el archivo.');
    } finally {
      setBusy('');
    }
  }

  async function pickModel() {
    try {
      let chosen: File[] = [];
      if (tool!.multiple) {
        const picked = await File.pickFileAsync({ multipleFiles: true });
        if (picked.canceled) return;
        chosen = picked.result;
      } else {
        const picked = await File.pickFileAsync();
        if (picked.canceled) return;
        chosen = [picked.result];
      }
      const files = chosen.map((file) => ({ uri: file.uri, name: file.name }));
      const wrong = files.find((file) => !/\.(stl|obj|3mf|png|jpe?g|webp)$/i.test(file.name));
      if (wrong) return setError(`«${wrong.name}» no es un archivo 3D (STL, OBJ o 3MF).`);
      await openFiles(files);
    } catch {
      setError('No se pudo abrir el archivo.');
    }
  }

  async function pickPhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: tool!.multiple });
    if (picked.canceled) return;
    await openFiles(picked.assets.map((asset, index) => ({ uri: asset.uri, name: asset.fileName || `foto-${index + 1}.${asset.mimeType?.includes('png') ? 'png' : 'jpg'}` })));
  }

  async function run() {
    if (!engine.current || !tool) return;
    setError('');
    setBusy('Calculando las piezas… los modelos grandes o el vaciado pueden tardar un poco.');
    try {
      // Numbers typed out of range go back inside it, like the website.
      const clean: Params = { ...params };
      for (const field of tool.fields) {
        if (field.type === 'number') clean[field.key] = Math.min(field.max, Math.max(field.min, Number(clean[field.key]) || field.min));
      }
      const answer = await engine.current.call<{ pieces: ResultPiece[]; notes: string[] }>('run', { slug: tool.slug, params: clean, scale: num(scale) || 100 });
      setPieces(answer.pieces);
      setNotes(answer.notes);
      setResult({ id: resultId(), claimed: false });
      // Usage metrics for the dashboard; losing one is harmless.
      supabase.from('tool_runs').insert({ tool: tool.slug }).then(() => {});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo procesar con estos ajustes.');
    } finally {
      setBusy('');
    }
  }

  /** The first download of a result counts against the plan (trying is free); later ones of it do not. */
  async function claim() {
    if (!result) return false;
    if (result.claimed) return true;
    const { error: failed } = await supabase.rpc('claim_download', { p_result: result.id, p_tool: tool!.slug });
    if (failed && !(failed.code === 'PGRST202' || /claim_download/.test(failed.message))) {
      setError(failed.message);
      return false;
    }
    setResult({ ...result, claimed: true });
    return true;
  }

  async function save(kind: 'stl' | 'stl-all' | '3mf', index?: number) {
    if (!engine.current || !tool || !pieces) return;
    if (!(await claim())) return;
    setBusy('Preparando el archivo…');
    try {
      const { base64, mime } = await engine.current.call<{ base64: string; mime: string }>('export', { kind, index });
      const base = (opened?.name ?? sources[0] ?? 'modelo').replace(/[^\w-]+/g, '-');
      const name = `${base}-${tool.slug}${kind === 'stl' && index !== undefined ? `-${pieces[index].name.replace(/[^\w-]+/g, '-')}` : kind === 'stl-all' ? '-todo' : ''}.${kind === '3mf' ? '3mf' : 'stl'}`;
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
      else Alert.alert('Archivo listo', `Se guardó como ${name}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar el archivo.');
    } finally {
      setBusy('');
    }
  }

  async function clear() {
    await engine.current?.call('clear');
    setOpened(null);
    setSources([]);
    setPieces(null);
  }

  const shown = tool.fields.filter((field) => !visible || visible.includes(field.key));

  return (
    <Screen>
      <Stack.Screen options={{ title: tool.name }} />
      <Muted>{tool.description}</Muted>

      <ToolEngineView ref={engine} onReady={() => setReady(true)} style={{ height: 300 }} />
      {has && <Muted style={{ textAlign: 'center' }}>Gira con un dedo · acerca con dos</Muted>}

      <Row>
        {!tool.imagesOnly && (
          <Button style={{ flex: 1 }} variant={has ? 'secondary' : 'primary'} icon="cube" label={tool.multiple ? 'Agregar archivo 3D' : 'Archivo 3D'} disabled={!ready || !!busy} onPress={pickModel} />
        )}
        {(tool.images || tool.multiple) && (
          <Button style={{ flex: 1 }} variant={has ? 'secondary' : 'primary'} icon="image" label={tool.multiple ? 'Agregar foto' : 'Foto'} disabled={!ready || !!busy} onPress={pickPhoto} />
        )}
      </Row>

      {opened && (
        <Card style={{ gap: Spacing.one }}>
          <Text style={{ color: Colors.text, fontWeight: '700' }}>{opened.name}</Text>
          <Muted>
            {mm(opened.size)}
            {opened.triangles ? ` · ${opened.triangles.toLocaleString('es-MX')} triángulos` : ''}
          </Muted>
          {!opened.image && <Field label="Escala" unit="%" numeric value={scale} onChangeText={(text) => (setScale(text), setPieces(null))} placeholder="100" />}
        </Card>
      )}
      {sources.length > 0 && (
        <Card style={{ gap: Spacing.one }}>
          <Text style={{ color: Colors.text, fontWeight: '700' }}>{sources.length} archivos</Text>
          <Muted>{sources.join(' · ')}</Muted>
          <Pressable accessibilityRole="button" onPress={clear}>
            <Text style={{ color: Colors.danger }}>Quitar todos</Text>
          </Pressable>
        </Card>
      )}

      {has && (
        <Card>
          {shown.map((field) => {
            const value = params[field.key];
            if (field.type === 'number') {
              return (
                <Field
                  key={field.key}
                  label={field.label}
                  unit={field.unit}
                  numeric
                  value={String(value ?? '')}
                  onChangeText={(text) => set(field.key, text === '' ? '' : num(text))}
                  hint={[field.hint, `De ${field.min} a ${field.max}`].filter(Boolean).join(' · ')}
                />
              );
            }
            if (field.type === 'checkbox') {
              return (
                <View key={field.key} style={{ gap: Spacing.one }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: Colors.text, flex: 1 }}>{field.label}</Text>
                    <Switch value={Boolean(value)} onValueChange={(on) => set(field.key, on)} trackColor={{ true: Colors.accent }} />
                  </Row>
                  {field.hint ? <Muted style={{ fontSize: 12 }}>{field.hint}</Muted> : null}
                </View>
              );
            }
            const options = field.options.filter((option) => !LATER[tool.slug]?.includes(option.value) || field.key !== 'method');
            return options.length <= 4 ? (
              <View key={field.key} style={{ gap: Spacing.one }}>
                <Chips label={field.label} options={options} value={String(value)} onChange={(choice) => set(field.key, choice)} />
                {field.hint ? <Muted style={{ fontSize: 12 }}>{field.hint}</Muted> : null}
              </View>
            ) : (
              <Select key={field.key} label={field.label} value={String(value)} onChange={(choice) => choice && set(field.key, choice)} options={options} />
            );
          })}
          {LATER[tool.slug] && <Muted>Cortar con cuchillo o pintando las piezas llega en la siguiente versión de la app; mientras, está en la web.</Muted>}
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
      {busy ? <Muted style={{ textAlign: 'center' }}>{busy}</Muted> : null}
      {has && <Button icon="color-wand" label={pieces ? 'Calcular otra vez' : 'Calcular'} loading={!!busy} disabled={!ready} onPress={run} />}

      {pieces && (
        <Card>
          <Text style={{ color: Colors.text, fontWeight: '700', fontSize: 16 }}>
            {pieces.length} {pieces.length === 1 ? 'pieza' : 'piezas'}
          </Text>
          {notes.map((note) => (
            <Muted key={note}>{note}</Muted>
          ))}
          {pieces.map((piece, index) => (
            <Row key={`${piece.name}-${index}`} style={{ justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: piece.color ?? (piece.extra ? Colors.gold : Colors.accent) }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text }} numberOfLines={1}>
                    {piece.name}
                  </Text>
                  <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{mm(piece.size)}</Text>
                </View>
              </View>
              {pieces.length > 1 && (
                <Pressable accessibilityRole="button" accessibilityLabel={`Guardar ${piece.name} en STL`} hitSlop={8} onPress={() => save('stl', index)}>
                  <Ionicons name="download-outline" size={22} color={Colors.accent} />
                </Pressable>
              )}
            </Row>
          ))}
          <Button icon="share" label={pieces.length === 1 ? 'Guardar STL' : 'Guardar 3MF (todas las piezas)'} disabled={!!busy} onPress={() => save(pieces.length === 1 ? 'stl' : '3mf', 0)} />
          {pieces.length > 1 && <Button variant="secondary" icon="albums" label="Guardar STL con todas juntas" disabled={!!busy} onPress={() => save('stl-all')} />}
          <Muted>Calcular es libre; la primera descarga de cada resultado cuenta en tu plan.</Muted>
        </Card>
      )}
      <View style={{ height: Radius.large }} />
    </Screen>
  );
}
