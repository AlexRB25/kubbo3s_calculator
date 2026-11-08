import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button, Muted } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { setScanPhotos } from '@/lib/scan-capture';
import {
  advise,
  angleBetween,
  cameraDirection,
  covered,
  finished,
  lightFromExif,
  newCapture,
  record,
  RINGS,
  SECTOR_DEG,
  SECTORS,
  type Advice,
  type Capture,
  type Light,
  type Mode,
  type Reading,
} from '@/lib/scan-guide';

const MIN_PHOTOS = 20;
const MAX_PHOTOS = 300;

/** Picks a photo size of about 3 MP–12 MP (sharp enough for photogrammetry, light enough to upload). */
function pickSize(sizes: string[]) {
  const numeric = sizes
    .map((size) => ({ size, parts: size.split('x').map(Number) }))
    .filter(({ parts }) => parts.length === 2 && parts.every((value) => value > 0))
    .map(({ size, parts }) => ({ size, long: Math.max(...parts) }))
    .filter(({ long }) => long <= 3200 && long >= 1600)
    .sort((a, b) => b.long - a.long);
  return numeric[0]?.size;
}

/** A ring of 24 segments: the parts of the current lap that already have a photo. */
function LapRing({ capture }: { capture: Capture }) {
  const ring = Math.min(capture.ring, RINGS.length - 1);
  const size = 76;
  const center = size / 2;
  const radius = 30;
  const segments = Array.from({ length: SECTORS }, (_, index) => {
    const taken = capture.mode === 'turntable' ? index < capture.turntableShots[ring] : capture.done[ring][index];
    const from = ((index * SECTOR_DEG + 1.5 - 90) * Math.PI) / 180;
    const to = (((index + 1) * SECTOR_DEG - 1.5 - 90) * Math.PI) / 180;
    const d = `M ${center + radius * Math.cos(from)} ${center + radius * Math.sin(from)} A ${radius} ${radius} 0 0 1 ${center + radius * Math.cos(to)} ${center + radius * Math.sin(to)}`;
    return <Path key={index} d={d} stroke={taken ? Colors.accent : 'rgba(255,255,255,0.25)'} strokeWidth={8} fill="none" />;
  });
  return (
    <Svg width={size} height={size}>
      {segments}
    </Svg>
  );
}

const ARROWS = { left: 'arrow-back', right: 'arrow-forward', up: 'arrow-up', down: 'arrow-down' } as const;

/**
 * Guided capture: the camera takes the photos by itself when the phone is steady and pointing at a part of the
 * lap that has no photo yet, and tells the user (on screen and out loud) where to go next.
 */
export default function ScanCameraScreen() {
  useKeepAwake();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode | null>(null);
  const [capture, setCapture] = useState<Capture>(() => newCapture('walk'));
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [banner, setBanner] = useState('');
  const [voice, setVoice] = useState(true);
  const [sensors, setSensors] = useState(true);
  const [pictureSize, setPictureSize] = useState<string | undefined>();

  const camera = useRef<CameraView>(null);
  const ready = useRef(false);
  const busy = useRef(false);
  const reading = useRef<Reading | null>(null);
  const captureRef = useRef(capture);
  const photos = useRef<{ uri: string; size: number }[]>([]);
  const light = useRef<Light>('ok');
  const lastShot = useRef(0);
  const spoken = useRef({ key: '', at: 0 });
  const voiceRef = useRef(voice);

  useEffect(() => {
    voiceRef.current = voice;
    if (!voice) Speech.stop();
  }, [voice]);

  // Where the phone points, and how fast it turns (°/s, from two readings).
  useEffect(() => {
    if (!mode) return;
    let previous: { direction: Reading['direction']; at: number } | null = null;
    let subscription: { remove(): void } | null = null;
    DeviceMotion.isAvailableAsync().then((available) => {
      if (!available) return setSensors(false);
      DeviceMotion.setUpdateInterval(100);
      subscription = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        // Radians on both platforms; converted if a device reports degrees.
        const unit = Math.abs(rotation.beta) > 7 || Math.abs(rotation.gamma) > 7 ? Math.PI / 180 : 1;
        const direction = cameraDirection(rotation.alpha * unit, rotation.beta * unit, rotation.gamma * unit);
        const now = Date.now();
        const raw = previous ? (angleBetween(previous.direction, direction) / Math.max(0.03, (now - previous.at) / 1000)) : 0;
        const speed = reading.current ? reading.current.speed * 0.6 + raw * 0.4 : raw;
        previous = { direction, at: now };
        reading.current = { direction, speed };
      });
    });
    return () => subscription?.remove();
  }, [mode]);

  function say(next: Advice) {
    const now = Date.now();
    const quiet = next.shoot || next.key === 'still' || next.key === 'wait' || next.key === 'first';
    if (quiet || next.key === spoken.current.key) return;
    if (now - spoken.current.at < 2000 && next.tone !== 'done') return;
    spoken.current = { key: next.key, at: now };
    if (voiceRef.current) {
      Speech.stop();
      Speech.speak(next.text, { language: 'es-MX', rate: 1.05 });
    }
  }

  async function shoot() {
    if (!camera.current || busy.current) return;
    busy.current = true;
    const direction = reading.current?.direction;
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.85, exif: true, shutterSound: false });
      if (!picture?.uri || !direction) return;
      light.current = lightFromExif(picture.exif);
      lastShot.current = Date.now();
      photos.current.push({ uri: picture.uri, size: 0 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const before = captureRef.current;
      const after = record(before, direction);
      captureRef.current = after;
      setCapture(after);
      if (after.ring !== before.ring) {
        const text = finished(after) ? '¡Listo! Ya tienes todas las fotos.' : `¡Vuelta completa! ${RINGS[after.ring].hint}`;
        setBanner(text);
        spoken.current = { key: `ring-${after.ring}`, at: Date.now() };
        if (voiceRef.current) {
          Speech.stop();
          Speech.speak(text, { language: 'es-MX', rate: 1.05 });
        }
        setTimeout(() => setBanner(''), 4000);
        lastShot.current = Date.now() + 2500; // give time to move to the next lap
      }
      if (photos.current.length >= MAX_PHOTOS) finish();
    } catch {
      // A failed photo is skipped; the next good moment takes another.
    } finally {
      busy.current = false;
    }
  }

  // Every quarter second: what to say, and whether to take a photo now.
  useEffect(() => {
    if (!mode || !permission?.granted) return;
    const timer = setInterval(() => {
      const current = captureRef.current;
      const next = advise(current, reading.current, light.current, Date.now() - lastShot.current);
      setAdvice((old) => (old?.key === next.key && old.text === next.text ? old : next));
      say(next);
      if (next.shoot && ready.current && !busy.current && !finished(current)) shoot();
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, permission?.granted]);

  useEffect(() => () => void Speech.stop(), []);

  function start(chosen: Mode) {
    const fresh = newCapture(chosen);
    captureRef.current = fresh;
    setCapture(fresh);
    photos.current = [];
    lastShot.current = Date.now();
    setMode(chosen);
    if (voiceRef.current)
      Speech.speak(chosen === 'walk' ? 'Apunta al objeto y camina despacio a su alrededor. Yo tomo las fotos.' : 'Deja el teléfono quieto apuntando al objeto. Yo te digo cuándo girarlo.', {
        language: 'es-MX',
        rate: 1.05,
      });
  }

  function finish() {
    setScanPhotos(photos.current.map((photo, index) => ({ uri: photo.uri, name: `foto-${String(index + 1).padStart(3, '0')}.jpg`, size: photo.size, mime: 'image/jpeg' })));
    Speech.stop();
    router.back();
  }

  async function onReady() {
    ready.current = true;
    if (Platform.OS !== 'android' || pictureSize) return;
    const sizes = await camera.current?.getAvailablePictureSizesAsync().catch(() => [] as string[]);
    const size = pickSize(sizes ?? []);
    if (size) setPictureSize(size);
  }

  if (!permission) return <View style={styles.black} />;
  if (!permission.granted)
    return (
      <SafeAreaView style={[styles.black, styles.center]}>
        <Text style={styles.title}>Necesito la cámara</Text>
        <Muted style={{ textAlign: 'center' }}>El escáner toma las fotos por ti mientras rodeas el objeto.</Muted>
        <Button icon="camera" label="Dar permiso de cámara" onPress={requestPermission} />
        <Button variant="secondary" label="Cancelar" onPress={() => router.back()} />
      </SafeAreaView>
    );

  if (!mode)
    return (
      <SafeAreaView style={[styles.black, styles.center]}>
        <Text style={styles.title}>¿Cómo vas a escanear?</Text>
        <Muted style={{ textAlign: 'center' }}>
          Pon el objeto en una mesa con luz pareja (sin sol directo), sobre una superficie con textura (un periódico sirve). Lo que sea brillante o transparente no se escanea bien.
        </Muted>
        <Pressable style={styles.option} onPress={() => start('walk')}>
          <Ionicons name="walk" size={28} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Camino alrededor del objeto</Text>
            <Muted>Das dos vueltas: una de frente y otra desde arriba. Lo mejor para objetos grandes.</Muted>
          </View>
        </Pressable>
        <Pressable style={styles.option} onPress={() => start('turntable')}>
          <Ionicons name="sync" size={28} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Giro el objeto</Text>
            <Muted>El teléfono quieto (mejor en un tripié) y tú giras el objeto poquito a poquito. Lo mejor para objetos chicos.</Muted>
          </View>
        </Pressable>
        <Button variant="secondary" label="Cancelar" onPress={() => router.back()} />
      </SafeAreaView>
    );

  const count = capture.photos;
  const ring = Math.min(capture.ring, RINGS.length - 1);
  const tone = advice?.tone === 'warn' ? '#F5B83D' : advice?.tone === 'done' ? '#34D399' : '#FFFFFF';

  return (
    <View style={styles.black}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" animateShutter={false} pictureSize={pictureSize} onCameraReady={onReady} />

      {/* Where the object must stay. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={styles.target} />
      </View>

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.top}>
          <LapRing capture={capture} />
          <View style={{ flex: 1 }}>
            <Text style={styles.lap}>{finished(capture) ? 'Terminado' : RINGS[ring].name}</Text>
            <Text style={styles.small}>
              {count} fotos · {covered(capture, ring)} de {SECTORS} en esta vuelta
            </Text>
            {!sensors && capture.mode === 'walk' && <Text style={styles.warn}>Tu teléfono no tiene sensor de giro: usa «Giro el objeto».</Text>}
          </View>
          <Pressable hitSlop={12} onPress={() => setVoice((value) => !value)}>
            <Ionicons name={voice ? 'volume-high' : 'volume-mute'} size={26} color="#fff" />
          </Pressable>
        </View>

        <View style={{ flex: 1 }} />

        {!!banner && <Text style={styles.banner}>{banner}</Text>}

        <View style={styles.bottom}>
          <View style={styles.adviceRow}>
            {advice?.arrow && <Ionicons name={ARROWS[advice.arrow]} size={34} color={tone} />}
            <Text style={[styles.advice, { color: tone }]}>{advice?.text ?? ''}</Text>
          </View>
          <Text style={styles.small}>Mantén el objeto dentro del círculo, a unos 30–60 cm. Las fotos se toman solas.</Text>
          <View style={styles.actions}>
            <Button variant="secondary" label="Cancelar" style={{ flex: 1 }} onPress={() => (Speech.stop(), router.back())} />
            <Button
              icon="checkmark"
              label={count < MIN_PHOTOS ? `Faltan ${MIN_PHOTOS - count}` : 'Terminar'}
              disabled={count < MIN_PHOTOS}
              style={{ flex: 1 }}
              onPress={finish}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  option: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center', backgroundColor: '#181C1F', borderRadius: 14, padding: Spacing.three, alignSelf: 'stretch' },
  optionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  target: { width: 230, height: 230, borderRadius: 115, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)', borderStyle: 'dashed' },
  overlay: { ...StyleSheet.absoluteFill, padding: Spacing.three },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: Spacing.two },
  lap: { color: '#fff', fontSize: 17, fontWeight: '800' },
  small: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  warn: { color: '#F5B83D', fontSize: 13 },
  banner: { color: '#34D399', fontSize: 20, fontWeight: '800', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 14, padding: Spacing.three, marginBottom: Spacing.two },
  bottom: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  adviceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 56 },
  advice: { flex: 1, fontSize: 22, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
