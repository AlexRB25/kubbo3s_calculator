import { levelPrices, type PriceLevels } from './costs';
import { money, num } from './format';
import type { Channel } from './types';

export type LevelsDraft = Record<keyof PriceLevels, string>;

export const LEVEL_KEYS: (keyof PriceLevels)[] = ['normal', 'discount', 'wholesale', 'wholesale_min', 'list_extra'];

export const draftOf = (levels: PriceLevels): LevelsDraft => Object.fromEntries(LEVEL_KEYS.map((key) => [key, String(levels[key])])) as LevelsDraft;

/** The typed levels, or the reason they cannot be saved. */
export function readLevels(draft: LevelsDraft): { levels: PriceLevels } | { error: string } {
  const levels = Object.fromEntries(LEVEL_KEYS.map((key) => [key, num(draft[key])])) as PriceLevels;
  levels.wholesale_min = Math.round(levels.wholesale_min);
  if ([levels.normal, levels.discount, levels.wholesale].some((pct) => !(pct >= 0 && pct <= 1000))) return { error: 'Cada ganancia va de 0% a 1000% del costo.' };
  if (levels.discount > levels.normal) return { error: 'La ganancia con descuento no puede ser mayor que la normal.' };
  if (levels.wholesale > levels.discount) return { error: 'La ganancia de mayoreo no puede ser mayor que la de descuento.' };
  if (levels.wholesale_min < 2) return { error: 'El mayoreo empieza desde 2 piezas o más.' };
  if (!(levels.list_extra >= 0 && levels.list_extra <= 300)) return { error: 'El margen extra va de 0% a 300%.' };
  return { levels };
}

/** Only the levels that differ from the workshop's (a product follows the workshop in the rest). */
export function ownLevelsOnly(levels: PriceLevels, workshop: PriceLevels) {
  const own = Object.fromEntries(LEVEL_KEYS.flatMap((key) => (levels[key] !== workshop[key] ? [[key, levels[key]]] : [])));
  return Object.keys(own).length ? own : null;
}

/** The old single margin (% of the price) older app versions still read, kept in step with the normal level. */
export const marginOnPrice = (normal: number) => Math.min(94, Math.round(((normal * 100) / (100 + normal)) * 100) / 100);

/** "Lista $120 · Normal $100 · Descuento $88 · Mayoreo 10+ $75" for a channel. */
export function levelsLine(cost: number, channel: Channel, levels: PriceLevels, shippingAt?: (price: number) => number) {
  const prices = levelPrices(cost, channel, levels, shippingAt);
  if (prices.normal <= 0) return '';
  return [
    levels.list_extra > 0 ? `Lista ${money(prices.list)}` : '',
    `Normal ${money(prices.normal)}`,
    `Descuento ${money(prices.discount)}`,
    `Mayoreo ${levels.wholesale_min}+ ${money(prices.wholesale)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
