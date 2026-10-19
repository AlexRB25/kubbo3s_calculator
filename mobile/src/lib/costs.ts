import type { Channel, Filament, FilamentUse, Packaging, Part, Plate, Printer, Product } from './types';

export type CostBreakdown = {
  filament: number;
  electricity: number;
  machine: number;
  extra: number;
  total: number;
};

type Recipe = Pick<Product, 'filaments' | 'printer_ids' | 'print_minutes' | 'extra_cost'> & Partial<Pick<Product, 'plates' | 'parts'>>;

/** The pieces a product is made of; a single "Pieza" when none were declared. */
export function partsOf(product: Partial<Pick<Product, 'parts'>>): Part[] {
  return product.parts?.length ? product.parts : [{ id: 'pieza', name: 'Pieza', needed: 1 }];
}

/** How many of each piece a plate prints. Older plates without pieces print one whole product. */
export function plateParts(plate: Plate, parts: Part[]): Record<string, number> {
  return plate.parts ?? Object.fromEntries(parts.map((part) => [part.id, part.needed]));
}

/** Complete products that `pieces` make. */
export function productsFrom(pieces: Record<string, number>, parts: Part[]) {
  return parts.length ? Math.min(...parts.map((part) => Math.floor((pieces[part.id] ?? 0) / Math.max(part.needed, 1)))) : 0;
}

function breakdown(uses: Product['filaments'], minutes: number, machines: Printer[], filaments: Filament[], kwhPrice: number, extra: number): CostBreakdown {
  const filament = uses.reduce((total, use) => {
    const used = filaments.find((item) => item.id === use.filament_id);
    return total + use.grams * (used ? costPerGram(used) : 0);
  }, 0);
  const average = (pick: (printer: Printer) => number) =>
    machines.length ? machines.reduce((total, printer) => total + pick(printer), 0) / machines.length : 0;
  const hours = minutes / 60;
  const electricity = hours * (average((printer) => printer.power_watts) / 1000) * kwhPrice;
  const machine = hours * average((printer) => printer.hourly_cost);
  return { filament, electricity, machine, extra, total: filament + electricity + machine + extra };
}

/** One way of printing the product: which plates, how many times, and what it yields. */
export type Combo = {
  runs: { plate: Plate; printer: Printer; times: number }[];
  /** Complete products the runs give. */
  products: number;
  /** Pieces left over once those products are assembled. */
  leftovers: Record<string, number>;
  /** What one product costs this way (extra costs included). */
  cost: CostBreakdown;
  /** Filament and machine time that fall on one product. */
  filaments: FilamentUse[];
  minutes: number;
};

/** What printing a plate once costs on its printer: filament, electricity and wear. */
export function plateCost(plate: Plate, printer: Printer, filaments: Filament[], kwhPrice: number) {
  const uses = Object.entries(plate.grams).map(([filament_id, grams]) => ({ filament_id, grams: Number(grams) || 0 }));
  return breakdown(uses, plate.minutes, [printer], filaments, kwhPrice, 0);
}

type Option = { plate: Plate; printer: Printer; pieces: Record<string, number>; cost: number; detail: CostBreakdown };

function optionsOf(product: Recipe, filaments: Filament[], printers: Printer[], kwhPrice: number): Option[] {
  const parts = partsOf(product);
  return (product.plates ?? []).flatMap((plate) => {
    const printer = printers.find((item) => item.id === plate.printer_id);
    const pieces = plateParts(plate, parts);
    if (!printer || !parts.some((part) => (pieces[part.id] ?? 0) > 0)) return [];
    const detail = plateCost(plate, printer, filaments, kwhPrice);
    return [{ plate, printer, pieces, cost: detail.total, detail }];
  });
}

function comboOf(options: Option[], times: number[], parts: Part[], extra: number): Combo {
  const pieces: Record<string, number> = {};
  const grams = new Map<string, number>();
  let minutes = 0;
  const sum = { filament: 0, electricity: 0, machine: 0 };
  options.forEach((option, index) => {
    const count = times[index];
    if (!count) return;
    for (const [id, amount] of Object.entries(option.pieces)) pieces[id] = (pieces[id] ?? 0) + amount * count;
    for (const [id, amount] of Object.entries(option.plate.grams)) grams.set(id, (grams.get(id) ?? 0) + (Number(amount) || 0) * count);
    minutes += option.plate.minutes * count;
    sum.filament += option.detail.filament * count;
    sum.electricity += option.detail.electricity * count;
    sum.machine += option.detail.machine * count;
  });
  const products = Math.max(productsFrom(pieces, parts), 1);
  const leftovers = Object.fromEntries(
    parts.map((part) => [part.id, (pieces[part.id] ?? 0) - productsFrom(pieces, parts) * part.needed]).filter(([, left]) => Number(left) > 0),
  );
  const filament = sum.filament / products;
  const electricity = sum.electricity / products;
  const machine = sum.machine / products;
  return {
    runs: options.flatMap((option, index) => (times[index] ? [{ plate: option.plate, printer: option.printer, times: times[index] }] : [])),
    products: productsFrom(pieces, parts),
    leftovers,
    cost: { filament, electricity, machine, extra, total: filament + electricity + machine + extra },
    filaments: [...grams].filter(([, amount]) => amount > 0).map(([filament_id, amount]) => ({ filament_id, grams: amount / products })),
    minutes: minutes / products,
  };
}

/** Explored combinations stop here, so a product with many plates never freezes the page. */
const SEARCH_LIMIT = 60_000;

/**
 * The most expensive way to get one product: among the sets of plates that complete it with
 * nothing to spare (removing any print would leave a piece missing), the one that costs most
 * per product it yields. This is the cost the product carries, so prices never fall short.
 */
function dearest(options: Option[], parts: Part[], extra: number): Combo | null {
  const covers = (times: number[]) =>
    parts.every((part) => options.reduce((total, option, index) => total + (option.pieces[part.id] ?? 0) * times[index], 0) >= part.needed);
  const limits = options.map((option) =>
    Math.max(0, ...parts.map((part) => ((option.pieces[part.id] ?? 0) > 0 ? Math.ceil(part.needed / option.pieces[part.id]) : 0))),
  );
  let best: Combo | null = null;
  let visited = 0;
  const times = options.map(() => 0);
  const walk = (index: number) => {
    if (++visited > SEARCH_LIMIT) return;
    if (index === options.length) {
      if (!covers(times)) return;
      // Minimal: taking away any single print breaks it.
      for (let i = 0; i < times.length; i++) {
        if (!times[i]) continue;
        times[i]--;
        const still = covers(times);
        times[i]++;
        if (still) return;
      }
      const combo = comboOf(options, times, parts, extra);
      if (!best || combo.cost.total > best.cost.total) best = combo;
      return;
    }
    for (let count = 0; count <= limits[index]; count++) {
      times[index] = count;
      walk(index + 1);
    }
    times[index] = 0;
  };
  walk(0);
  return best;
}

/**
 * The cheapest way per product: for batches of 1 to 24 products, the plates that make the batch
 * for the least money, keeping the batch with the lowest cost per product (the smaller one on a tie).
 */
function cheapest(options: Option[], parts: Part[], extra: number): Combo | null {
  // Cheapest price of one piece of each kind, to bound the search.
  const unit = Object.fromEntries(
    parts.map((part) => [
      part.id,
      Math.min(...options.filter((option) => (option.pieces[part.id] ?? 0) > 0).map((option) => option.cost / option.pieces[part.id])),
    ]),
  );
  if (parts.some((part) => !Number.isFinite(unit[part.id]))) return null;
  let best: Combo | null = null;
  for (let batch = 1; batch <= 24; batch++) {
    const need = parts.map((part) => part.needed * batch);
    const limits = options.map((option) =>
      Math.max(0, ...parts.map((part, j) => ((option.pieces[part.id] ?? 0) > 0 ? Math.ceil(need[j] / option.pieces[part.id]) : 0))),
    );
    let bestCost = Infinity;
    let bestTimes: number[] | null = null;
    let visited = 0;
    const times = options.map(() => 0);
    const walk = (index: number, spent: number, missing: number[]) => {
      if (++visited > SEARCH_LIMIT / 3) return;
      const bound = Math.max(0, ...missing.map((left, j) => left * unit[parts[j].id]));
      if (spent + bound >= bestCost - 1e-9) return;
      if (missing.every((left) => left <= 0)) {
        bestCost = spent;
        bestTimes = [...times];
        return;
      }
      if (index === options.length) return;
      const option = options[index];
      for (let count = limits[index]; count >= 0; count--) {
        times[index] = count;
        walk(index + 1, spent + option.cost * count, missing.map((left, j) => left - (option.pieces[parts[j].id] ?? 0) * count));
      }
      times[index] = 0;
    };
    walk(0, 0, need);
    if (!bestTimes) continue;
    const combo = comboOf(options, bestTimes, parts, extra);
    if (!best || combo.cost.total < best.cost.total - 1e-9) best = combo;
  }
  return best;
}

/** The dearest and the cheapest way to print the product from its plates (null when they cannot complete it). */
export function plateCombos(product: Recipe, filaments: Filament[], printers: Printer[], kwhPrice: number) {
  const parts = partsOf(product);
  const options = optionsOf(product, filaments, printers, kwhPrice);
  const missing = parts.filter((part) => !options.some((option) => (option.pieces[part.id] ?? 0) > 0));
  if (!options.length || missing.length) return { dearest: null, cheapest: null, missing };
  return { dearest: dearest(options, parts, product.extra_cost), cheapest: cheapest(options, parts, product.extra_cost), missing };
}

/**
 * What one piece costs to make. With plates, it is the most expensive way of printing it, so
 * prices always cover the worst case. Older products without plates use one recipe and the
 * average electricity and wear of their printers.
 */
export function productCost(product: Recipe, filaments: Filament[], printers: Printer[], kwhPrice: number): CostBreakdown {
  if (product.plates?.length) {
    const combo = dearest(optionsOf(product, filaments, printers, kwhPrice), partsOf(product), product.extra_cost);
    if (combo) return combo.cost;
  }
  const assigned = printers.filter((printer) => product.printer_ids.includes(printer.id));
  return breakdown(product.filaments, product.print_minutes, assigned, filaments, kwhPrice, product.extra_cost);
}

/** Commission the channel keeps on a sale (shipping is counted apart). */
export function channelFees(channel: Channel | undefined, unitPrice: number, quantity = 1) {
  if (!channel) return 0;
  return quantity * ((unitPrice * channel.commission_pct) / 100 + channel.fixed_fee);
}

/**
 * What sending one order costs the seller: the channel's shipping plus the product's packaging.
 * Prices "sin envío" leave it out (the buyer picks up or pays shipping); "con envío" add it.
 */
export function shippingCost(channel: Channel, packaging: Packaging | undefined) {
  return channel.shipping_cost + (packaging?.cost ?? 0);
}

/** What is left from selling one piece at `price` after commission, `shipping` and production. */
export function unitProfit(price: number, cost: number, channel: Channel, shipping = 0) {
  return price - channelFees(channel, price) - shipping - cost;
}

/** Price that leaves `marginPct` percent of the cost as profit once the channel and `shipping` are paid. */
export function suggestedPrice(cost: number, channel: Channel, marginPct: number, shipping = 0) {
  const kept = 1 - channel.commission_pct / 100;
  if (kept <= 0) return 0;
  return (cost * (1 + marginPct / 100) + channel.fixed_fee + shipping) / kept;
}

/** "Caja chica · 20×15×10 cm"-style label: measures only when there are any. */
export function packagingName(packaging: Packaging) {
  const sizes = [packaging.length_mm, packaging.width_mm, packaging.height_mm].filter((value) => value > 0);
  return sizes.length ? `${packaging.name} · ${sizes.map((value) => Math.round(value) / 10).join('×')} cm` : packaging.name;
}

/** What a gram of a filament costs: from its purchases, or the reference per kg while it has none. */
export function costPerGram(filament: Pick<Filament, 'avg_cost_per_g' | 'cost_per_kg'>) {
  return filament.avg_cost_per_g > 0 ? Number(filament.avg_cost_per_g) : filament.cost_per_kg / 1000;
}

export function filamentName(filament: Filament) {
  return [filament.material, filament.color, filament.brand].filter(Boolean).join(' ');
}
