import type { Packaging } from './types';

// Same file in web/src/lib and mobile/src/lib: keep them identical.

/** How the product goes protected inside the box: cm added to each of its measures before looking for a box. */
export const PROTECTIONS = [
  { value: 5, label: 'Justa', hint: '+0.5 cm' },
  { value: 10, label: 'Emplayada', hint: '+1 cm' },
  { value: 30, label: 'Con burbuja', hint: '+3 cm' },
  { value: 50, label: 'Burbuja doble o frágil', hint: '+5 cm' },
] as const;

/** Default margin when the product does not say (wrapped in bubble wrap), in mm. */
export const DEFAULT_MARGIN_MM = 30;

type Size = [number, number, number];

const sorted = (size: number[]) => [...size].map(Number).sort((a, b) => b - a) as Size;

/** Whether `item` fits in `box` turned any way: its biggest side in the box's biggest, and so on. Both in mm. */
export function fits(item: Size, box: Size, margin: number) {
  const a = sorted(item).map((value) => value + margin);
  const b = sorted(box);
  return a.every((value, index) => value <= b[index] + 1e-6);
}

export type BoxFit = { box: Packaging; spare: number };

/**
 * The boxes the product fits in, smallest first, with how much room is left over (mm, the tightest side).
 * Only packages with their three measures; envelopes and bags count too when they have them.
 */
export function boxesFor(size: Size, boxes: Packaging[], margin = DEFAULT_MARGIN_MM): BoxFit[] {
  if (!size.every((value) => Number(value) > 0)) return [];
  const item = sorted(size);
  return boxes
    .filter((box) => box.length_mm > 0 && box.width_mm > 0 && box.height_mm > 0)
    .filter((box) => fits(item, [box.length_mm, box.width_mm, box.height_mm], margin))
    .map((box) => {
      const inside = sorted([box.length_mm, box.width_mm, box.height_mm]);
      return { box, spare: Math.min(...inside.map((value, index) => value - item[index] - margin)), volume: inside[0] * inside[1] * inside[2] };
    })
    .sort((a, b) => a.volume - b.volume)
    .map(({ box, spare }) => ({ box, spare }));
}

/** Product measures to show: "12 × 8 × 5 cm". */
export const sizeLabel = (size: number[]) => `${size.map((mm) => `${Math.round(Number(mm)) / 10}`.replace(/\.0$/, '')).join(' × ')} cm`;

/** Most carriers bill the volumetric weight as length × width × height (cm) ÷ 5000, in kg. */
export const VOLUMETRIC_DIVISOR = 5000;

type BoxShape = Pick<Packaging, 'length_mm' | 'width_mm' | 'height_mm'> & { style?: Packaging['style']; name?: string };

/**
 * What an empty cardboard box weighs, estimated from the sheet it is cut from: a shipping box (four flaps) is a
 * blank of (2·(L+W) + glue tab) × (H + W); a box with a lid (maletín, pizza) about (L + 4H) × (2W + 3H). Single
 * wall corrugated weighs about 500 g/m², double wall 800 and the thin board of mailers 400.
 */
export function estimateBoxGrams(box: BoxShape) {
  const [l, w, h] = [box.length_mm, box.width_mm, box.height_mm].map((value) => Number(value) / 1000);
  if (!(l > 0 && w > 0 && h > 0)) return 0;
  const area = box.style === 'mailer' ? (l + 4 * h) * (2 * w + 3 * h) : (2 * (l + w) + 0.03) * (h + w);
  const grams = /doble/i.test(box.name ?? '') ? 800 : box.style === 'mailer' ? 400 : 500;
  return Math.round(area * grams);
}

/** The box's weight: the one written down, or the estimate when it is 0. */
export function boxGrams(box: BoxShape & { weight_g?: number }) {
  const written = Number(box.weight_g) || 0;
  return { grams: written || estimateBoxGrams(box), estimated: !written };
}

/** Weights to write in an online store: real (piece + box), volumetric, and the one carriers bill (the bigger), in kg. */
export function parcelWeights(productGrams: number, box: BoxShape & { weight_g?: number }, divisor = VOLUMETRIC_DIVISOR) {
  const { grams, estimated } = boxGrams(box);
  const real = (Math.max(0, productGrams) + grams) / 1000;
  const volumetric = ((Number(box.length_mm) / 10) * (Number(box.width_mm) / 10) * (Number(box.height_mm) / 10)) / divisor;
  return { boxGrams: grams, estimated, real, volumetric, billable: Math.max(real, volumetric) };
}

/** 0.4567 -> "0.46 kg"; under a kilo also in grams: "0.46 kg (457 g)". */
export const kg = (value: number) => `${(Math.ceil(value * 100) / 100).toFixed(2)} kg${value < 1 ? ` (${Math.round(value * 1000)} g)` : ''}`;
