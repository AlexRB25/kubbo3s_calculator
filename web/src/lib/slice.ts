// Reads what a slicer says about a print: time, grams per filament (with type and colour), printer model and
// pieces per plate. Bambu Studio / OrcaSlicer 3MF exported with "Exportar la placa de impresión actual"
// (or .gcode.3mf), and plain G-code from PrusaSlicer, OrcaSlicer or Cura. Same file in web and mobile.
import { strFromU8, unzipSync } from 'fflate';

import type { Filament, Printer } from './types';

export type SlicedFilament = { slot: number; type: string; color: string; grams: number };
export type SlicedPlate = { index: number; minutes: number; filaments: SlicedFilament[]; objects: string[]; thumbnail: Uint8Array | null };
export type SliceReport = { slicer: string; printerModel: string; plates: SlicedPlate[]; warnings: string[] };

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

  if (name.endsWith('.bgcode')) throw new Error('El G-code binario (.bgcode) no se puede leer: en PrusaSlicer exporta en G-code de texto (.gcode).');
  if (name.endsWith('.gcode') || name.endsWith('.gco') || name.endsWith('.g')) {
    const read = readGcode(gcodeText(bytes), warnings);
    if (!read.minutes && !read.filaments.length) throw new Error('Este G-code no trae el tiempo ni el filamento. ¿Es de un laminador?');
    return { slicer: read.slicer, printerModel: read.printerModel, plates: [{ index: 1, minutes: read.minutes, filaments: read.filaments, objects: [], thumbnail: null }], warnings };
  }
  if (!name.endsWith('.3mf')) throw new Error('Sube un archivo .3mf o .gcode.');

  let files: Record<string, Uint8Array>;
  try {
    // Never the G-code itself unless needed: it can weigh tens of MB.
    files = unzipSync(bytes, { filter: (file) => /^Metadata\/(slice_info\.config|project_settings\.config|plate_\d+\.png)$/i.test(file.name) });
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
    const objects = [...body.matchAll(/<object\s+([^>]*?)\/?>/g)].map((match) => attributes(match[1])).filter((item) => item.skipped !== 'true').map((item) => item.name ?? '');
    const minutes = Number(meta.prediction) / 60;
    if (!minutes && !filaments.length) continue;
    plates.push({ index, minutes, filaments, objects, thumbnail: files[`Metadata/plate_${index}.png`] ?? null });
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
  return { slicer, printerModel, plates: plates.sort((a, b) => a.index - b.index), warnings };
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
