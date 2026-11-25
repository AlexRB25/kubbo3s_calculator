// Reads what a slicer says about a print: time, grams per filament (with type and colour), printer model and
// pieces per plate. Bambu Studio / OrcaSlicer 3MF exported with "Exportar la placa de impresión actual"
// (or .gcode.3mf), and plain G-code from PrusaSlicer, OrcaSlicer or Cura. Resin: time and ml of Chitubox
// (.ctb, .cbddlp, .photon), Elegoo (.goo), Anycubic Photon Workshop (.pwmx, .pwma…) and Prusa (.sl1, .sl1s).
// Same file in web and mobile.
import { strFromU8, unzipSync } from 'fflate';

import type { Filament, Printer } from './types';

/** `grams` are ml when `resin`. */
export type SlicedFilament = { slot: number; type: string; color: string; grams: number; resin?: boolean };
export type SlicedPlate = {
  index: number;
  minutes: number;
  filaments: SlicedFilament[];
  objects: string[];
  thumbnail: Uint8Array | null;
  /** The slicer's id of each object (same order as `objects`); its colour in `pick` is R + G·256 + B·65536. */
  objectIds?: number[];
  /** Bambu/Orca plate seen from above, and the same view with every object painted in its id colour. */
  top?: Uint8Array | null;
  pick?: Uint8Array | null;
};
export type SliceReport = {
  slicer: string;
  printerModel: string;
  plates: SlicedPlate[];
  warnings: string[];
  /** Size of each object on the build plate (when the 3MF carries its meshes). */
  sizes?: PieceSize[];
  /** A resin print: its amounts are ml. */
  resin?: boolean;
};

/** How big a printed piece is: the box that wraps it as it sits on the plate, in mm (length ≥ width, then height). */
export type PieceSize = { name: string; size: [number, number, number] };

/** Bambu's internal printer codes, for files that do not name the model. */
const BAMBU_MODELS: Record<string, string> = {
  N1: 'Bambu Lab A1 mini',
  N2S: 'Bambu Lab A1',
  C11: 'Bambu Lab P1P',
  C12: 'Bambu Lab P1S',
  C13: 'Bambu Lab X1E',
  'BL-P001': 'Bambu Lab X1 Carbon',
  'BL-P002': 'Bambu Lab X1',
  O1D: 'Bambu Lab H2D',
};

const attributes = (text: string) => Object.fromEntries([...text.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));

/** "1d 2h 30m 5s" -> minutes. */
function minutesOf(text: string) {
  let seconds = 0;
  for (const [, value, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) seconds += Number(value) * { d: 86400, h: 3600, m: 60, s: 1 }[unit as 'd' | 'h' | 'm' | 's'];
  return seconds / 60;
}

/** The value of a "; key = value" comment line of a G-code. */
function setting(gcode: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return gcode.match(new RegExp(`^;\\s*${escaped}\\s*[=:]\\s*(.+)$`, 'mi'))?.[1].trim() ?? '';
}

const list = (value: string) => value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);

/** Reads time and filament from G-code text (only the header and the end matter, where slicers write them). */
function readGcode(gcode: string, warnings: string[]): Omit<SlicedPlate, 'index' | 'thumbnail' | 'objects'> & { printerModel: string; slicer: string } {
  const slicer = /bambustudio/i.test(gcode) ? 'Bambu Studio' : /orcaslicer/i.test(gcode) ? 'OrcaSlicer' : /prusaslicer/i.test(gcode) ? 'PrusaSlicer' : /;FLAVOR:|Cura_SteamEngine/i.test(gcode) ? 'Cura' : 'Laminador';
  const total = gcode.match(/total estimated time:\s*([^;\n]+)/i)?.[1] ?? setting(gcode, 'estimated printing time (normal mode)') ?? '';
  let minutes = total ? minutesOf(total) : 0;
  if (!minutes) minutes = Number(gcode.match(/^;TIME:(\d+)/m)?.[1] ?? 0) / 60;

  const types = list(setting(gcode, 'filament_type'));
  const colours = list(setting(gcode, 'filament_colour') || setting(gcode, 'extruder_colour'));
  let grams = list(setting(gcode, 'filament used [g]')).map(Number);
  if (!grams.some((value) => value > 0)) {
    const total = Number(setting(gcode, 'total filament weight [g]'));
    if (total > 0) grams = [total];
  }
  if (!grams.some((value) => value > 0)) {
    // Cura only says metres: a 1.75 mm filament of PLA (1.24 g/cm³) weighs about 2.98 g per metre.
    const metres = (gcode.match(/^;Filament used:\s*(.+)$/m)?.[1] ?? '').split(',').map((value) => parseFloat(value));
    if (metres.some((value) => value > 0)) {
      grams = metres.map((value) => Math.round(value * 2.98 * 100) / 100);
      warnings.push('Cura no dice los gramos: los calculamos con los metros para filamento de 1.75 mm y densidad de PLA. Revísalos.');
    }
  }
  const filaments = grams.flatMap((value, slot) =>
    value > 0 ? [{ slot: slot + 1, type: types[slot] ?? types[0] ?? '', color: normalHex(colours[slot] ?? ''), grams: value }] : [],
  );
  const printerModel = setting(gcode, 'printer_model') || gcode.match(/^;TARGET_MACHINE\.NAME:(.+)$/m)?.[1].trim() || '';
  return { slicer, minutes, filaments, printerModel };
}

const normalHex = (value: string) => {
  const hex = value.replace(/^#/, '').slice(0, 6);
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : '';
};

/** Only the start and the end of a big G-code: that is where every slicer writes time and filament. */
function gcodeText(bytes: Uint8Array) {
  const head = 400_000;
  const tail = 1_200_000;
  if (bytes.length <= head + tail) return strFromU8(bytes);
  return `${strFromU8(bytes.subarray(0, head))}\n${strFromU8(bytes.subarray(bytes.length - tail))}`;
}

/** Reads a sliced 3MF or a G-code. Throws with a message for the user when the file has no slicing data. */
export function readSlice(bytes: Uint8Array, fileName: string): SliceReport {
  const name = fileName.toLowerCase();
  const warnings: string[] = [];

  if (isResinFile(name)) return readResin(bytes, name);
  if (name.endsWith('.bgcode')) throw new Error('El G-code binario (.bgcode) no se puede leer: en PrusaSlicer exporta en G-code de texto (.gcode).');
  if (name.endsWith('.gcode') || name.endsWith('.gco') || name.endsWith('.g')) {
    const read = readGcode(gcodeText(bytes), warnings);
    if (!read.minutes && !read.filaments.length) throw new Error('Este G-code no trae el tiempo ni el filamento. ¿Es de un laminador?');
    let sizes: PieceSize[] = [];
    try {
      sizes = gcodeSizes(bytes);
    } catch {
      sizes = [];
    }
    return { slicer: read.slicer, printerModel: read.printerModel, plates: [{ index: 1, minutes: read.minutes, filaments: read.filaments, objects: [], thumbnail: null }], warnings, sizes };
  }
  if (!name.endsWith('.3mf')) throw new Error('Sube un archivo .3mf o .gcode, o uno de resina (.ctb, .goo, .pwmx, .sl1).');

  let files: Record<string, Uint8Array>;
  try {
    // Never the G-code itself unless needed: it can weigh tens of MB.
    // The meshes too (for the size of each piece), unless they are huge.
    files = unzipSync(bytes, {
      filter: (file) =>
        /^Metadata\/(slice_info\.config|project_settings\.config|(plate|top|pick)_\d+\.png)$/i.test(file.name) ||
        (/^3D\/.+\.model$/i.test(file.name) && file.originalSize < 120_000_000),
    });
  } catch {
    throw new Error('No se pudo abrir el 3MF: ¿está completo?');
  }
  const info = files['Metadata/slice_info.config'] ? strFromU8(files['Metadata/slice_info.config']) : '';
  let settings: Record<string, unknown> = {};
  try {
    settings = files['Metadata/project_settings.config'] ? JSON.parse(strFromU8(files['Metadata/project_settings.config'])) : {};
  } catch {
    settings = {};
  }
  const firstOf = (value: unknown) => (Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : '');
  const settingTypes = Array.isArray(settings.filament_type) ? (settings.filament_type as string[]) : [];
  const settingColours = Array.isArray(settings.filament_colour) ? (settings.filament_colour as string[]) : [];

  const plates: SlicedPlate[] = [];
  let printerCode = '';
  for (const [, body] of info.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
    const meta = Object.fromEntries([...body.matchAll(/<metadata\s+([^>]*?)\/?>/g)].map((match) => [attributes(match[1]).key, attributes(match[1]).value]));
    const index = Number(meta.index) || plates.length + 1;
    printerCode ||= meta.printer_model_id ?? '';
    const filaments = [...body.matchAll(/<filament\s+([^>]*?)\/?>/g)].flatMap((match) => {
      const item = attributes(match[1]);
      const grams = Number(item.used_g);
      const slot = Number(item.id) || 1;
      return grams > 0 ? [{ slot, type: item.type || settingTypes[slot - 1] || '', color: normalHex(item.color || settingColours[slot - 1] || ''), grams }] : [];
    });
    const listed = [...body.matchAll(/<object\s+([^>]*?)\/?>/g)].map((match) => attributes(match[1])).filter((item) => item.skipped !== 'true');
    const objects = listed.map((item) => item.name ?? '');
    const objectIds = listed.map((item) => Number(item.identify_id) || 0);
    const minutes = Number(meta.prediction) / 60;
    if (!minutes && !filaments.length) continue;
    plates.push({
      index,
      minutes,
      filaments,
      objects,
      objectIds,
      thumbnail: files[`Metadata/plate_${index}.png`] ?? null,
      top: files[`Metadata/top_${index}.png`] ?? null,
      pick: files[`Metadata/pick_${index}.png`] ?? null,
    });
  }

  let slicer = /Orca/i.test(info) ? 'OrcaSlicer' : /X-BBL|Bambu/i.test(info) ? 'Bambu Studio / OrcaSlicer' : 'Laminador';
  let printerModel = firstOf(settings.printer_model) || BAMBU_MODELS[printerCode] || '';

  // Some exports only carry the plate's G-code inside: read it from there.
  if (!plates.length) {
    let inner: Record<string, Uint8Array> = {};
    try {
      inner = unzipSync(bytes, { filter: (file) => /^Metadata\/plate_\d+\.gcode$/i.test(file.name) });
    } catch {
      inner = {};
    }
    for (const [path, content] of Object.entries(inner)) {
      const read = readGcode(gcodeText(content), warnings);
      if (!read.minutes && !read.filaments.length) continue;
      const index = Number(path.match(/plate_(\d+)/)?.[1]) || plates.length + 1;
      plates.push({ index, minutes: read.minutes, filaments: read.filaments, objects: [], thumbnail: files[`Metadata/plate_${index}.png`] ?? null });
      printerModel ||= read.printerModel;
      slicer = read.slicer;
    }
  }
  if (!plates.length) {
    throw new Error('Este 3MF no está laminado. En el laminador dale a «Laminar placa» y luego, en el menú de «Imprimir placa», elige «Exportar la placa de impresión actual».');
  }
  let sizes: PieceSize[] = [];
  try {
    sizes = pieceSizes(files);
  } catch {
    sizes = [];
  }
  return { slicer, printerModel, plates: plates.sort((a, b) => a.index - b.index), warnings, sizes };
}

// ── Resin: time and ml from the files of resin slicers ──

/** Files of resin slicers this reads. */
export const RESIN_FILE = /\.(ctb|cbddlp|photon|goo|pwm[a-z0-9]{0,2}|pw0|pwx|pws|dlp|sl1s?)$/i;
export const isResinFile = (name: string) => RESIN_FILE.test(name);

const MAX_SECONDS = 30 * 24 * 3600;
const sane = (value: number, max: number) => Number.isFinite(value) && value > 0 && value < max;

/** A zero-terminated text of a binary header, when it reads as one (else ''). */
function textAt(bytes: Uint8Array, start: number, length: number) {
  if (start < 0 || length <= 0 || length > 256 || start + length > bytes.length) return '';
  let text = '';
  for (let index = start; index < start + length; index++) {
    const code = bytes[index];
    if (code === 0) break;
    if (code < 32 || code > 126) return '';
    text += String.fromCharCode(code);
  }
  return text.trim();
}

/** Where an ASCII tag first appears after `from`, or -1. */
function findTag(bytes: Uint8Array, tag: string, from = 0, to = bytes.length) {
  const codes = [...tag].map((char) => char.charCodeAt(0));
  const end = Math.min(to, bytes.length - codes.length);
  outer: for (let index = from; index <= end; index++) {
    for (let at = 0; at < codes.length; at++) if (bytes[index + at] !== codes[at]) continue outer;
    return index;
  }
  return -1;
}

/** Chitubox .ctb / .cbddlp / .photon (little endian): print time and ml in its header. */
function readChitubox(bytes: Uint8Array, view: DataView) {
  const magic = view.getUint32(0, true);
  if (magic === 0x12fd0107) {
    throw new Error('Este .ctb viene cifrado (Chitubox 2 o más nuevo) y no se puede leer. Escribe el tiempo y los ml que te da el laminador en la placa, o exporta en .ctb versión 3.');
  }
  if ((magic !== 0x12fd0086 && magic !== 0x12fd0019) || bytes.length < 112) throw new Error('No reconozco este archivo de Chitubox: ¿está completo?');
  const seconds = view.getUint32(76, true);
  const paramsAt = view.getUint32(84, true);
  const paramsSize = view.getUint32(88, true);
  const ml = paramsAt > 0 && paramsSize >= 24 && paramsAt + 24 <= bytes.length ? view.getFloat32(paramsAt + 20, true) : 0;
  // Version 3 and up name the printer in the slicer section.
  let model = '';
  const slicerAt = view.getUint32(104, true);
  if (view.getUint32(4, true) >= 3 && slicerAt > 0 && slicerAt + 36 <= bytes.length) {
    model = textAt(bytes, view.getUint32(slicerAt + 28, true), view.getUint32(slicerAt + 32, true));
  }
  return { slicer: 'Chitubox', model, seconds, ml };
}

/** Anycubic Photon Workshop .pwmx, .pwma, .pws… (little endian): a HEADER section with ml and time. */
function readAnycubic(bytes: Uint8Array, view: DataView) {
  const at = findTag(bytes, 'HEADER\0', 12, 4096);
  if (at < 0 || at + 88 > bytes.length) throw new Error('No reconozco este archivo de Anycubic: ¿está completo?');
  const length = view.getUint32(at + 12, true);
  const ml = view.getFloat32(at + 52, true);
  const seconds = length >= 72 ? view.getUint32(at + 84, true) : 0;
  const machine = findTag(bytes, 'MACHINE\0', 12);
  const model = machine > 0 ? textAt(bytes, machine + 16, 96) : '';
  return { slicer: 'Photon Workshop', model, seconds, ml };
}

/**
 * Elegoo .goo (big endian). After the two previews come the print settings, which end with the print time (s),
 * the volume (mm³) and the grams; they are found as the three values whose density is the one of a resin.
 */
function readGoo(bytes: Uint8Array, view: DataView) {
  const model = textAt(bytes, 92, 32);
  const start = 195_310;
  let seconds = 0;
  let ml = 0;
  for (let at = start; at + 12 <= Math.min(bytes.length, start + 600); at++) {
    const time = view.getUint32(at, false);
    const volume = view.getFloat32(at + 4, false);
    const grams = view.getFloat32(at + 8, false);
    if (!sane(time, MAX_SECONDS) || time < 60 || !sane(volume, 1e9) || !sane(grams, 1e6)) continue;
    const density = grams / (volume / 1000);
    if (density >= 0.8 && density <= 1.6) {
      seconds = time;
      ml = volume / 1000;
      break;
    }
  }
  return { slicer: 'Elegoo', model, seconds, ml };
}

/** Prusa .sl1 / .sl1s: a zip whose config.ini says the time and the ml. */
function readPrusaResin(bytes: Uint8Array) {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => /^(config\.ini|thumbnail\/[^/]+\.png)$/i.test(file.name) });
  } catch {
    throw new Error('No se pudo abrir el archivo de PrusaSlicer: ¿está completo?');
  }
  const ini = files['config.ini'] ? strFromU8(files['config.ini']) : '';
  const value = (key: string) => ini.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'mi'))?.[1].trim() ?? '';
  // The biggest preview.
  const thumbnail =
    Object.entries(files)
      .filter(([path]) => path.startsWith('thumbnail/'))
      .sort((a, b) => b[1].length - a[1].length)[0]?.[1] ?? null;
  const model = value('printerModel');
  return { slicer: 'PrusaSlicer', model: model && !/^prusa/i.test(model) ? `Prusa ${model}` : model, seconds: Number(value('printTime')) || 0, ml: Number(value('usedMaterial')) || 0, thumbnail };
}

function readResin(bytes: Uint8Array, name: string): SliceReport {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read: { slicer: string; model: string; seconds: number; ml: number; thumbnail?: Uint8Array | null } = /\.sl1s?$/.test(name)
    ? readPrusaResin(bytes)
    : name.endsWith('.goo')
      ? readGoo(bytes, view)
      : textAt(bytes, 0, 8) === 'ANYCUBIC'
        ? readAnycubic(bytes, view)
        : readChitubox(bytes, view);
  const minutes = sane(read.seconds, MAX_SECONDS) ? read.seconds / 60 : 0;
  const ml = sane(read.ml, 100_000) ? Math.round(read.ml * 100) / 100 : 0;
  if (!minutes && !ml) throw new Error('Este archivo no trae el tiempo ni los ml de resina. Escríbelos a mano en la placa.');
  const warnings: string[] = [];
  if (!ml) warnings.push('El archivo no trae los ml de resina: escríbelos a mano en la placa.');
  if (!minutes) warnings.push('El archivo no trae el tiempo de impresión: escríbelo a mano en la placa.');
  return {
    slicer: read.slicer,
    printerModel: read.model,
    resin: true,
    warnings,
    sizes: [],
    plates: [
      {
        index: 1,
        minutes,
        filaments: ml ? [{ slot: 1, type: 'Resina', color: '', grams: ml, resin: true }] : [],
        objects: [],
        thumbnail: read.thumbnail ?? null,
      },
    ],
  };
}

// ── Size of the pieces, from the meshes of a 3MF ──

/** A 3MF transform "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32" (row vectors: p2 = p · M). */
type Matrix = number[];
const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function readMatrix(text: string | undefined): Matrix {
  const values = (text ?? '').trim().split(/\s+/).map(Number);
  return values.length === 12 && values.every(Number.isFinite) ? values : IDENTITY;
}

const transformPoint = (m: Matrix, [x, y, z]: number[]) => [
  x * m[0] + y * m[3] + z * m[6] + m[9],
  x * m[1] + y * m[4] + z * m[7] + m[10],
  x * m[2] + y * m[5] + z * m[8] + m[11],
];

/** `inner` first, then `outer`. */
function combine(inner: Matrix, outer: Matrix): Matrix {
  const out: Matrix = [];
  for (let row = 0; row < 4; row++) {
    const [x, y, z] = [inner[row * 3], inner[row * 3 + 1], inner[row * 3 + 2]];
    const w = row < 3 ? 0 : 1;
    out.push(
      x * outer[0] + y * outer[3] + z * outer[6] + w * outer[9],
      x * outer[1] + y * outer[4] + z * outer[7] + w * outer[10],
      x * outer[2] + y * outer[5] + z * outer[8] + w * outer[11],
    );
  }
  return out;
}

type Bounds = [number, number, number, number, number, number];
type ModelObject = { name: string; bounds: Bounds | null; components: { key: string; transform: Matrix }[] };

function grow(total: Bounds | null, [x, y, z]: number[]): Bounds {
  return total ? [Math.min(total[0], x), Math.min(total[1], y), Math.min(total[2], z), Math.max(total[3], x), Math.max(total[4], y), Math.max(total[5], z)] : [x, y, z, x, y, z];
}

/**
 * Size of each object placed on the plate of a 3MF: its meshes (also those split into 3D/Objects/*.model by
 * Bambu Studio and OrcaSlicer) with every rotation and scale applied. Empty when the file has no meshes.
 */
export function pieceSizes(files: Record<string, Uint8Array>): PieceSize[] {
  const objects = new Map<string, ModelObject>();
  for (const [path, content] of Object.entries(files)) {
    if (!/^3D\/.+\.model$/i.test(path)) continue;
    const xml = strFromU8(content);
    for (const match of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
      const head = attributes(match[1]);
      const body = match[2];
      let bounds: Bounds | null = null;
      for (const vertex of body.matchAll(/<vertex\b([^>]*?)\/?>/g)) {
        const point = attributes(vertex[1]);
        const coords = [Number(point.x), Number(point.y), Number(point.z)];
        if (coords.every(Number.isFinite)) bounds = grow(bounds, coords);
      }
      const components = [...body.matchAll(/<component\b([^>]*?)\/?>/g)].map((component) => {
        const item = attributes(component[1]);
        // p:path (production extension) points to another model file; without it, this same file.
        const other = /p:path="([^"]*)"/.exec(component[1])?.[1]?.replace(/^\//, '');
        return { key: `${other || path}#${item.objectid ?? ''}`, transform: readMatrix(item.transform) };
      });
      objects.set(`${path}#${head.id}`, { name: head.name ?? '', bounds, components });
    }
  }

  /** The corners of an object and its components after `transform`, folded into one box. */
  const boundsOf = (key: string, transform: Matrix, depth = 0): Bounds | null => {
    const object = objects.get(key);
    if (!object || depth > 8) return null;
    let total: Bounds | null = null;
    if (object.bounds) {
      const [a, b, c, d, e, f] = object.bounds;
      for (const x of [a, d]) for (const y of [b, e]) for (const z of [c, f]) total = grow(total, transformPoint(transform, [x, y, z]));
    }
    for (const component of object.components) {
      const inner = boundsOf(component.key, combine(component.transform, transform), depth + 1);
      if (inner) total = grow(grow(total, [inner[0], inner[1], inner[2]]), [inner[3], inner[4], inner[5]]);
    }
    return total;
  };

  const main = Object.keys(files).find((path) => /^3D\/3dmodel\.model$/i.test(path));
  if (!main) return [];
  const build = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(strFromU8(files[main]))?.[1] ?? '';
  const sizes: PieceSize[] = [];
  for (const match of build.matchAll(/<item\b([^>]*?)\/?>/g)) {
    const item = attributes(match[1]);
    if (item.printable === '0') continue;
    const key = `${main}#${item.objectid}`;
    const box = boundsOf(key, readMatrix(item.transform));
    if (!box) continue;
    const [length, width] = [box[3] - box[0], box[4] - box[1]].sort((p, q) => q - p);
    const height = box[5] - box[2];
    const round = (value: number) => Math.round(value * 10) / 10;
    if (length > 0 && width > 0 && height > 0) sizes.push({ name: objects.get(key)?.name ?? '', size: [round(length), round(width), round(height)] });
  }
  return sizes;
}

// ── Size of the pieces, from the moves of a G-code ──

/** The object a G-code line starts printing (null: it stops printing one), or undefined when it says neither. */
function objectMarker(line: string): string | null | undefined {
  // PrusaSlicer / OrcaSlicer: "; printing object box.stl id:0 copy 0" … "; stop printing object …".
  if (line.startsWith('; printing object ')) return line.slice(18).replace(/\s+id:\d+\s+copy\s+\d+\s*$/i, '').trim();
  if (line.startsWith('; stop printing object')) return null;
  // Bambu Studio: "; start printing object, unique label id: 12" … "; stop printing object, unique label id: 12".
  if (line.startsWith('; start printing object')) return `Pieza ${line.match(/id:\s*(\d+)/)?.[1] ?? ''}`.trim();
  // Bambu Studio (other versions): "; OBJECT_ID: 12" before each object's part of a layer.
  if (line.startsWith('; OBJECT_ID:')) return `Pieza ${line.slice(12).trim()}`;
  // Cura: ";MESH:Cuerpo.stl" (";MESH:NONMESH" is the skirt and travel between pieces).
  if (line.startsWith(';MESH:')) return line.slice(6) === 'NONMESH' ? null : line.slice(6).trim();
  return undefined;
}

/**
 * Size of each piece a plain G-code prints, from its extruding moves: X/Y/Z where filament comes out, per object
 * when the slicer labels them (PrusaSlicer, OrcaSlicer, Bambu, Cura). Without labels, one piece from the second
 * layer up (the first carries the purge line and the brim). Reads the whole file in chunks.
 */
export function gcodeSizes(bytes: Uint8Array): PieceSize[] {
  const boxes = new Map<string, Bounds>();
  let labelled = false;
  let current: string | null = null;
  let x = 0;
  let y = 0;
  let z = 0;
  let e = 0;
  let relativeE = false;
  let firstZ = Infinity;
  // Inside a prime tower, skirt or brim: extrusion that is not the piece.
  let aside = false;
  const CHUNK = 4_000_000;
  const readLine = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    if (line[0] === ';') {
      const marker = objectMarker(line);
      if (marker !== undefined) {
        labelled = true;
        current = marker;
      }
      // "; FEATURE: Prime tower" (Bambu/Orca), ";TYPE:Wipe tower" (Prusa), ";TYPE:SKIRT" (Cura): not the piece.
      const feature = /^;\s*(?:FEATURE|TYPE)\s*:\s*(.+)$/i.exec(line)?.[1];
      if (feature) aside = /prime tower|wipe tower|skirt|brim|purge/i.test(feature);
      return;
    }
    const code = line.split(';', 1)[0];
    if (code.startsWith('M82')) relativeE = false;
    else if (code.startsWith('M83')) relativeE = true;
    else if (code.startsWith('G92')) {
      const value = /E(-?[\d.]+)/.exec(code);
      if (value) e = Number(value[1]);
    } else if (code[0] === 'G' && (code[1] === '0' || code[1] === '1') && (code.length === 2 || code[2] === ' ')) {
      let extrudes = false;
      for (const word of code.split(/\s+/)) {
        const value = Number(word.slice(1));
        if (!Number.isFinite(value)) continue;
        if (word[0] === 'X') x = value;
        else if (word[0] === 'Y') y = value;
        else if (word[0] === 'Z') z = value;
        else if (word[0] === 'E') {
          extrudes = relativeE ? value > 0 : value > e;
          if (!relativeE) e = value;
        }
      }
      if (!extrudes || aside || code[1] !== '1') return;
      if (firstZ === Infinity) firstZ = z;
      const key = labelled ? current : '';
      if (key === null || (!labelled && z <= firstZ + 1e-6)) return;
      boxes.set(key, grow(boxes.get(key) ?? null, [x, y, z]));
    }
  };
  // In chunks cut at a line break (never inside a line or a character), so no huge string is built.
  for (let start = 0; start < bytes.length; ) {
    let end = Math.min(bytes.length, start + CHUNK);
    if (end < bytes.length) {
      const cut = bytes.lastIndexOf(10, end - 1);
      if (cut > start) end = cut + 1;
    }
    for (const line of strFromU8(bytes.subarray(start, end)).split('\n')) readLine(line);
    start = end;
  }
  // Moves before the first label (purge, priming) are no piece.
  if (labelled) boxes.delete('');
  const round = (value: number) => Math.round(value * 10) / 10;
  const sizes: PieceSize[] = [];
  for (const [name, box] of boxes) {
    // Moves run along the middle of each line: the outer edge is half a line (~0.2 mm) further out.
    const [length, width] = [box[3] - box[0] + 0.4, box[4] - box[1] + 0.4].sort((p, q) => q - p);
    // The piece starts on the bed: its height is the top of its last layer.
    const height = box[5];
    if (length > 0 && width > 0 && height > 0) sizes.push({ name: name || 'Pieza', size: [round(length), round(width), round(height)] });
  }
  return sizes;
}

/**
 * The product's size suggested by its pieces (mm: length, width, height): `assembled` is the biggest piece (by its
 * longest side, then volume); `packed` is every piece the product takes lying flat in layers, for a product that
 * ships disassembled (only when it has more than one piece). An estimate: the user can correct it.
 */
export function productSizes(sizes: PieceSize[], pieces: { name: string; needed: number }[]) {
  const volume = (size: number[]) => size[0] * size[1] * size[2];
  const assembled = [...sizes].sort((a, b) => Math.max(...b.size) - Math.max(...a.size) || volume(b.size) - volume(a.size))[0]?.size ?? null;
  const stack: number[][] = [];
  for (const piece of pieces) {
    const same = sizes.filter((item) => pieceName(item.name).toLowerCase() === piece.name.toLowerCase());
    if (!same.length) continue;
    const size = [...same.sort((a, b) => volume(b.size) - volume(a.size))[0].size].sort((p, q) => q - p);
    for (let copy = 0; copy < Math.max(1, piece.needed); copy++) stack.push(size);
  }
  if (!stack.length && sizes.length > 1) {
    // Pieces without names: copies are alike in size, and how many of each the plate prints tells how many one
    // product takes (10 shells and 10 eyes → one of each).
    const groups: { size: number[]; count: number }[] = [];
    for (const item of sizes) {
      const size = [...item.size].sort((p, q) => q - p);
      const group = groups.find((other) => other.size.every((value, axis) => Math.abs(value - size[axis]) < 1));
      if (group) group.count += 1;
      else groups.push({ size, count: 1 });
    }
    const needed = neededPerProduct(groups.map((group) => group.count));
    groups.forEach((group, index) => {
      for (let copy = 0; copy < needed[index]; copy++) stack.push(group.size);
    });
  }
  const round = (value: number) => Math.round(value * 10) / 10;
  if (stack.length < 2) return { assembled, packed: null };
  // Lying flat in layers on the footprint of the widest piece: the small ones side by side (filling up to 80 % of
  // the floor, room lost between them), a new layer when they no longer fit; each layer as tall as its tallest.
  const length = Math.max(...stack.map((size) => size[0]));
  const width = Math.max(...stack.map((size) => size[1]));
  const floor = length * width * 0.8;
  let height = 0;
  let used = Infinity;
  let layer = 0;
  for (const size of [...stack].sort((a, b) => b[0] * b[1] - a[0] * a[1])) {
    const area = size[0] * size[1];
    if (used + area > floor) {
      height += layer;
      used = 0;
      layer = 0;
    }
    used += area;
    layer = Math.max(layer, size[2]);
  }
  height += layer;
  const packed: [number, number, number] = [round(length), round(width), round(height)];
  return { assembled, packed };
}

// ── Matching what the slicer says with the user's own filaments and printers ──

const FAMILIES = ['PETG', 'PET', 'PLA', 'ABS', 'ASA', 'TPU', 'TPE', 'PCTG', 'PC', 'PA', 'NYLON', 'PVA', 'HIPS', 'PP', 'PEEK'];
const family = (material: string) => {
  const upper = material.toUpperCase();
  return FAMILIES.find((item) => upper.includes(item)) ?? upper.trim();
};

function rgb(hex: string) {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  return value ? [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) : null;
}

/** 0 = same colour; about 440 = black against white. */
export function colourDistance(a: string, b: string) {
  const one = rgb(a);
  const two = rgb(b);
  if (!one || !two) return 999;
  // Weighted so greens and reds that look alike count as close.
  return Math.sqrt(2 * (one[0] - two[0]) ** 2 + 4 * (one[1] - two[1]) ** 2 + 3 * (one[2] - two[2]) ** 2) / 3;
}

/**
 * The user's filament closest to what the slicer used: same material first, then the nearest colour.
 * `close` is false when it had to settle for another material or a quite different colour.
 */
export function matchFilament(sliced: SlicedFilament, filaments: Filament[]): { filament: Filament | null; close: boolean } {
  // Resin goes to a resin (the one with most stock); a filament never to a resin.
  const resins = filaments.filter((filament) => filament.kind === 'resin');
  if (sliced.resin) {
    const best = [...resins].sort((a, b) => b.stock_g - a.stock_g)[0] ?? null;
    return { filament: best, close: resins.length === 1 };
  }
  if (resins.length < filaments.length) filaments = filaments.filter((filament) => filament.kind !== 'resin');
  let best: Filament | null = null;
  let bestScore = Infinity;
  for (const filament of filaments) {
    const sameFamily = family(filament.material) === family(sliced.type);
    const colour = sliced.color && filament.color_hex ? colourDistance(sliced.color, filament.color_hex) : 120;
    const score = colour + (sameFamily ? 0 : 400);
    if (score < bestScore) {
      best = filament;
      bestScore = score;
    }
  }
  return { filament: best, close: bestScore < 60 };
}

const plain = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Whether a printer can print a file sliced for `model` ("Bambu Lab A1" ≠ "Bambu Lab A1 mini"): the G-code is made
 * for that machine. A file that does not say its printer fits any.
 */
export function fitsPrinter(model: string, printer: Printer) {
  const wanted = plain(model);
  if (!wanted) return true;
  const own = plain(printer.model);
  if (own) return plain(`${printer.brand}${printer.model}`) === wanted || (wanted.endsWith(own) && wanted.includes(plain(printer.brand))) || wanted === own;
  // Printers without a model: their name without the device id ("Bambu Lab A1 · 605").
  return plain(printer.name.split('·')[0]) === wanted;
}

/**
 * Printers a file can go to: FDM files to FDM printers of the model it was sliced for; resin files to resin printers
 * (of that model when one is, else any of them, since resin slicers name the models their own way).
 */
export function printersFor(report: Pick<SliceReport, 'printerModel' | 'resin'>, printers: Printer[]) {
  const sameKind = printers.filter((printer) => (printer.technology === 'resin') === !!report.resin);
  const fitting = sameKind.filter((printer) => fitsPrinter(report.printerModel, printer));
  return report.resin && !fitting.length ? sameKind : fitting;
}

/** The user's first printer of the model the file was sliced for. */
export function matchPrinter(model: string, printers: Printer[]): Printer | null {
  if (!plain(model)) return null;
  return printers.find((printer) => fitsPrinter(model, printer)) ?? null;
}

// ── Pieces: copies of the same object on a plate are one piece ──

export type PieceGroup = { name: string; count: number };

/** "Cuerpo.stl", "Cuerpo.stl_2", "Cuerpo (3)", "Cuerpo copy" → "Cuerpo": the slicers name their copies like this. */
export function pieceName(object: string) {
  const name = object
    .trim()
    .replace(/\.(stl|3mf|obj|step|stp|amf)(?:[_ -]?\d+)?$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/[\s_-]*(copy|copia)(?:[\s_-]*\d+)?$/i, '')
    .trim();
  return name || 'Pieza';
}

/** The distinct pieces of a plate and how many of each it prints, in order of appearance. */
export function pieceGroups(objects: string[]): PieceGroup[] {
  const groups: PieceGroup[] = [];
  for (const object of objects) {
    const name = pieceName(object);
    const group = groups.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (group) group.count += 1;
    else groups.push({ name, count: 1 });
  }
  return groups;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** How many of each piece one product takes, guessed from the copies printed (6 bodies and 12 hands → 1 and 2). */
export function neededPerProduct(counts: number[]) {
  const divisor = counts.filter((count) => count > 0).reduce(gcd, 0) || 1;
  const needed = counts.map((count) => Math.max(1, Math.round(count / divisor)));
  // Counts with no clear ratio (7, 12 and 1) are not sets of one product: one of each, the user corrects it.
  return Math.max(...needed) > 4 ? counts.map(() => 1) : needed;
}
