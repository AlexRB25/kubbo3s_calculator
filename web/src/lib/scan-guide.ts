/**
 * Guided capture for the 3D scanner: from the phone's orientation it knows where the camera points, which parts of
 * each lap around the object already have a photo, and what to tell the user next ("sigue girando", "más despacio",
 * "regresa a tu izquierda", "falta luz"…). Pure functions, so they can be tested without a phone.
 */

export const SECTORS = 24; // one photo every 15° of each lap
export const SECTOR_DEG = 360 / SECTORS;

/** The laps: elevation of the camera in degrees (0 = horizontal, −90 = straight down). */
export const RINGS = [
  { name: 'Vuelta 1: de frente', hint: 'Apunta al objeto de frente, con el teléfono un poco más alto que él.', min: -40, max: 8, need: 21 },
  { name: 'Vuelta 2: desde arriba', hint: 'Sube el teléfono y apunta al objeto desde arriba, inclinado.', min: -75, max: -40, need: 18 },
] as const;

export type Mode = 'walk' | 'turntable';

export type Direction = { heading: number; elevation: number };

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (value: number) => (value * 180) / Math.PI;

/**
 * Where the back camera points, from the device's Euler angles in radians (W3C order: Z alpha, X beta, Y gamma —
 * the order expo-sensors' DeviceMotion reports). Heading is clockwise from the reference, elevation in degrees.
 */
export function cameraDirection(alpha: number, beta: number, gamma: number): Direction {
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(alpha), Math.sin(alpha), Math.cos(beta), Math.sin(beta), Math.cos(gamma), Math.sin(gamma)];
  // The camera looks along −Z of the device; this is −(third column of Rz·Rx·Ry).
  const x = -ca * sg - sa * sb * cg;
  const y = -sa * sg + ca * sb * cg;
  const z = -cb * cg;
  return { heading: (deg(Math.atan2(x, y)) + 360) % 360, elevation: deg(Math.asin(Math.max(-1, Math.min(1, z)))) };
}

/** Smallest signed difference b − a between two headings, in −180..180. */
export function turn(a: number, b: number) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/** Angle in degrees between two camera directions. */
export function angleBetween(a: Direction, b: Direction) {
  const vector = (d: Direction) => [Math.cos(rad(d.elevation)) * Math.sin(rad(d.heading)), Math.cos(rad(d.elevation)) * Math.cos(rad(d.heading)), Math.sin(rad(d.elevation))];
  const [p, q] = [vector(a), vector(b)];
  return deg(Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))));
}

export function sectorOf(heading: number, start: number) {
  return Math.floor((((heading - start) % 360) + 360) % 360 / SECTOR_DEG) % SECTORS;
}

export type Light = 'ok' | 'dark' | 'bright';

/** Reads the light from a photo's EXIF (iOS gives BrightnessValue; Android gives ISO and exposure time). */
export function lightFromExif(exif: Record<string, unknown> | undefined | null): Light {
  if (!exif) return 'ok';
  const number = (value: unknown) => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const [top, bottom] = raw.split('/').map(Number);
      return bottom ? top / bottom : Number(raw);
    }
    return NaN;
  };
  const brightness = number(exif.BrightnessValue);
  const iso = number(exif.ISOSpeedRatings ?? exif.PhotographicSensitivity ?? exif.ISO);
  const exposure = number(exif.ExposureTime);
  if (brightness < -0.5 || iso >= 1000 || exposure >= 1 / 15) return 'dark';
  if (brightness > 10 || (exposure > 0 && exposure <= 1 / 4000 && (!(iso > 0) || iso <= 64))) return 'bright';
  return 'ok';
}

/** Reads the light from the pixels of a small frame (RGBA, e.g. a 64×48 canvas): too dark, burnt by direct light, or fine. */
export function lightFromPixels(data: ArrayLike<number>): Light {
  let sum = 0;
  let burnt = 0;
  let count = 0;
  for (let index = 0; index + 2 < data.length; index += 4) {
    const luma = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    sum += luma;
    if (luma >= 250) burnt++;
    count++;
  }
  if (!count) return 'ok';
  const mean = sum / count;
  if (mean < 55) return 'dark';
  if (mean > 215 || burnt / count > 0.2) return 'bright';
  return 'ok';
}

export type Capture = {
  mode: Mode;
  ring: number; // current lap (index into RINGS); RINGS.length when finished
  start: number | null; // heading of the first photo: sector 0 of every lap
  done: boolean[][]; // [ring][sector] has a photo
  photos: number;
  sense: 1 | -1 | 0; // the way the user has been walking (+ = heading grows)
  turntableShots: number[]; // photos per lap in turntable mode
  last?: number; // sector of the previous photo in this lap
};

export const newCapture = (mode: Mode): Capture => ({
  mode,
  ring: 0,
  start: null,
  done: RINGS.map(() => Array<boolean>(SECTORS).fill(false)),
  photos: 0,
  sense: 0,
  turntableShots: RINGS.map(() => 0),
});

export const covered = (capture: Capture, ring: number) =>
  capture.mode === 'turntable' ? Math.min(SECTORS, capture.turntableShots[ring]) : capture.done[ring].filter(Boolean).length;

export const finished = (capture: Capture) => capture.ring >= RINGS.length;

export type Reading = { direction: Direction; speed: number }; // speed in °/s

export type Advice = { key: string; text: string; tone: 'go' | 'warn' | 'done'; shoot: boolean; arrow?: 'left' | 'right' | 'up' | 'down' };

const SIDE = (sign: number) => (sign < 0 ? 'derecha' : 'izquierda'); // walking to your right around the object lowers the heading

/**
 * What to tell the user now, and whether this is a good moment for a photo. `light` is from the last photo
 * (or, with `live`, from the preview right now); `sinceShot` is ms since the last photo.
 */
export function advise(capture: Capture, reading: Reading | null, light: Light, sinceShot: number, live = false): Advice {
  if (finished(capture)) return { key: 'done', text: '¡Listo! Ya tienes las fotos. Toca Terminar.', tone: 'done', shoot: false };
  if (!reading) return { key: 'wait', text: 'Preparando la cámara…', tone: 'warn', shoot: false };
  const ring = RINGS[capture.ring];
  const { direction, speed } = reading;

  if (speed > 70) return { key: 'slow', text: 'Más despacio', tone: 'warn', shoot: false };
  if (light === 'dark') {
    if (live || sinceShot < 2500) return { key: 'dark', text: 'Falta luz: prende más luces o acércate a una ventana', tone: 'warn', shoot: false };
  }
  if (light === 'bright' && (live || sinceShot < 2500)) return { key: 'bright', text: 'Demasiada luz o sol directo: busca luz pareja, sin sombras duras', tone: 'warn', shoot: false };
  if (direction.elevation > ring.max)
    return { key: `down-${capture.ring}`, text: capture.ring === 0 ? 'Inclina el teléfono un poco hacia abajo, hacia el objeto' : 'Sube el teléfono y apunta hacia abajo, al objeto', tone: 'warn', shoot: false, arrow: 'up' };
  if (direction.elevation < ring.min)
    return { key: `up-${capture.ring}`, text: 'Baja un poco el teléfono: apúntale más de frente', tone: 'warn', shoot: false, arrow: 'down' };

  const steady = speed < 25;
  if (capture.mode === 'turntable') {
    if (sinceShot < 1600) return { key: 'turn-object', text: 'Gira el objeto un poquito (como un minuto del reloj)', tone: 'go', shoot: false };
    if (!steady) return { key: 'still', text: 'Quieto el teléfono…', tone: 'go', shoot: false };
    return { key: 'turn-object', text: 'Gira el objeto un poquito (como un minuto del reloj)', tone: 'go', shoot: true };
  }

  if (capture.start === null) return { key: 'first', text: steady ? 'Primera foto…' : 'Apunta al objeto y quédate quieto', tone: 'go', shoot: steady };
  const done = capture.done[capture.ring];
  const here = sectorOf(direction.heading, capture.start);
  if (!done[here]) {
    const sense = capture.sense;
    if (steady) return { key: 'hold', text: 'Así, quieto…', tone: 'go', shoot: sinceShot > 600 };
    if (!sense) return { key: 'walk', text: 'Camina despacio alrededor del objeto, hacia el lado que quieras', tone: 'go', shoot: false };
    return { key: `go-${sense}`, text: `Sigue girando a tu ${SIDE(sense)}`, tone: 'go', shoot: false, arrow: sense < 0 ? 'right' : 'left' };
  }
  // This part already has a photo: send the user to the nearest gap, preferring the way they were going.
  let best: number | null = null;
  for (let step = 1; step < SECTORS; step++) {
    for (const sign of capture.sense ? [capture.sense, -capture.sense] : [1, -1]) {
      if (best === null && !done[(here + sign * step + SECTORS) % SECTORS]) best = sign * step;
    }
    if (best !== null) break;
  }
  if (best === null) return { key: 'next-ring', text: '¡Vuelta completa!', tone: 'done', shoot: false };
  if (!capture.sense) return { key: 'walk', text: 'Camina despacio alrededor del objeto, hacia el lado que quieras', tone: 'go', shoot: false };
  const sign = Math.sign(best);
  const back = sign !== capture.sense;
  const text = back ? `Regresa a tu ${SIDE(sign)}: faltó una parte` : `Sigue girando a tu ${SIDE(sign)}`;
  return { key: `${back ? 'back' : 'go'}-${sign}`, text, tone: back ? 'warn' : 'go', shoot: false, arrow: sign < 0 ? 'right' : 'left' };
}

/** Records a photo taken at `direction`; returns the new state (moves to the next lap when this one is covered). */
export function record(capture: Capture, direction: Direction): Capture {
  const next: Capture = { ...capture, done: capture.done.map((ring) => [...ring]), turntableShots: [...capture.turntableShots], photos: capture.photos + 1 };
  if (next.mode === 'turntable') {
    next.turntableShots[next.ring] += 1;
    if (next.turntableShots[next.ring] >= SECTORS) next.ring += 1;
    return next;
  }
  if (next.start === null) next.start = (direction.heading - SECTOR_DEG / 2 + 360) % 360;
  const sector = sectorOf(direction.heading, next.start);
  // The way the user walks: from the previous photo's sector to this one.
  const previous = lastSector(capture);
  if (previous !== null && previous !== sector) {
    const delta = turn(previous * SECTOR_DEG, sector * SECTOR_DEG);
    if (Math.abs(delta) <= 3 * SECTOR_DEG) next.sense = delta > 0 ? 1 : -1;
  }
  next.done[next.ring][sector] = true;
  next.last = sector;
  if (covered(next, next.ring) >= RINGS[next.ring].need && next.done[next.ring].every((value, index) => value || !gapMatters(next.done[next.ring], index))) {
    next.ring += 1;
    next.last = undefined;
  }
  return next;
}

/** A single missing sector between two taken ones is fine (photos overlap); two in a row are a real gap. */
function gapMatters(ring: boolean[], index: number) {
  return !ring[(index + 1) % SECTORS] || !ring[(index - 1 + SECTORS) % SECTORS];
}

function lastSector(capture: Capture) {
  return capture.last ?? null;
}
