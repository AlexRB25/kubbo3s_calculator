import type { Carrier, Channel, WasteRule, Filament, FilamentUse, Material, MaterialUse, Packaging, Part, Plate, Printer, Product } from './types';

export type CostBreakdown = {
  filament: number;
  electricity: number;
  machine: number;
  extra: number;
  /** Supplies (LEDs, bulbs, screws…) one product takes; included in total. */
  supplies?: number;
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

/** Where each piece of the product comes from, and what one product costs that way. */
export type Combo = {
  /** For each piece: the plate it is printed on and what one of it costs there. */
  choices: { part: Part; plate: Plate; printer: Printer; perPiece: number }[];
  /** What one product costs this way (extra costs included). */
  cost: CostBreakdown;
  /** Filament and machine time that fall on one product. */
  filaments: FilamentUse[];
  minutes: number;
};

/** What printing a plate once costs on its printer: filament, electricity and wear. */
export function plateCost(plate: Plate, printer: Printer, filaments: Filament[], kwhPrice: number, waste = 0) {
  // The filament is quoted with the waste of the plate (the user's rule by pieces on it).
  const uses = Object.entries(plate.grams).map(([filament_id, grams]) => ({ filament_id, grams: (Number(grams) || 0) * (1 + waste / 100) }));
  return breakdown(uses, plate.minutes, [printer], filaments, kwhPrice, 0);
}

/** Extra filament (%) the user quotes for a plate of `pieces` pieces; above the last rule, the last one. */
export function wastePct(rules: WasteRule[] | undefined, pieces: number) {
  const sorted = [...(rules ?? [])].filter((rule) => rule.max_pieces > 0).sort((a, b) => a.max_pieces - b.max_pieces);
  if (!sorted.length || pieces <= 0) return 0;
  return Number((sorted.find((rule) => pieces <= rule.max_pieces) ?? sorted[sorted.length - 1]).pct) || 0;
}

/** Pieces a plate prints in all (of every kind). */
export function piecesOnPlate(plate: Plate, parts: Part[]) {
  return Object.values(plateParts(plate, parts)).reduce((total, count) => total + (Number(count) || 0), 0);
}

type Option = { plate: Plate; printer: Printer; pieces: Record<string, number>; count: number; detail: CostBreakdown };

function optionsOf(product: Recipe, filaments: Filament[], printers: Printer[], kwhPrice: number, waste: WasteRule[] = []): Option[] {
  const parts = partsOf(product);
  return (product.plates ?? []).flatMap((plate) => {
    const printer = printers.find((item) => item.id === plate.printer_id);
    const pieces = plateParts(plate, parts);
    const count = piecesOnPlate(plate, parts);
    if (!printer || count <= 0) return [];
    return [{ plate, printer, pieces, count, detail: plateCost(plate, printer, filaments, kwhPrice, wastePct(waste, count)) }];
  });
}

/**
 * One product built from the plate each piece costs most (or least) on. A plate's cost is shared
 * among the pieces it prints: a plate of $40 with 10 bases makes each base $4.
 */
function choose(options: Option[], parts: Part[], extra: number, dearer: boolean): Combo | null {
  const choices: Combo["choices"] = [];
  const sum = { filament: 0, electricity: 0, machine: 0 };
  const grams = new Map<string, number>();
  let minutes = 0;
  for (const part of parts) {
    const candidates = options.filter((option) => (option.pieces[part.id] ?? 0) > 0);
    if (!candidates.length) return null;
    const best = candidates.reduce((pick, option) => {
      const better = dearer ? option.detail.total / option.count > pick.detail.total / pick.count : option.detail.total / option.count < pick.detail.total / pick.count;
      return better ? option : pick;
    });
    // Share of the plate that falls on the pieces of this kind one product takes.
    const share = part.needed / best.count;
    sum.filament += best.detail.filament * share;
    sum.electricity += best.detail.electricity * share;
    sum.machine += best.detail.machine * share;
    for (const [id, amount] of Object.entries(best.plate.grams)) grams.set(id, (grams.get(id) ?? 0) + (Number(amount) || 0) * share);
    minutes += best.plate.minutes * share;
    choices.push({ part, plate: best.plate, printer: best.printer, perPiece: best.detail.total / best.count });
  }
  return {
    choices,
    cost: { ...sum, extra, total: sum.filament + sum.electricity + sum.machine + extra },
    filaments: [...grams].filter(([, amount]) => amount > 0).map(([filament_id, amount]) => ({ filament_id, grams: amount })),
    minutes,
  };
}

/** The dearest and the cheapest way to print the product from its plates (null when they cannot complete it). */
export function plateCombos(product: Recipe, filaments: Filament[], printers: Printer[], kwhPrice: number, waste: WasteRule[] = []) {
  const parts = partsOf(product);
  const options = optionsOf(product, filaments, printers, kwhPrice, waste);
  const missing = parts.filter((part) => !options.some((option) => (option.pieces[part.id] ?? 0) > 0));
  if (!options.length || missing.length) return { dearest: null, cheapest: null, missing };
  return { dearest: choose(options, parts, product.extra_cost, true), cheapest: choose(options, parts, product.extra_cost, false), missing };
}

/**
 * What one piece costs to make. With plates, each piece costs its share of the plate it is printed
 * on, taking the plate where it costs most, so prices always cover the worst case. Older products
 * without plates use one recipe and the average electricity and wear of their printers.
 */
export function productCost(
  product: Recipe & { materials?: MaterialUse[] },
  filaments: Filament[],
  printers: Printer[],
  kwhPrice: number,
  materials: Material[] = [],
  waste: WasteRule[] = [],
): CostBreakdown {
  const supplies = suppliesCost(product.materials, materials);
  const withSupplies = (cost: CostBreakdown): CostBreakdown => ({ ...cost, supplies, total: cost.total + supplies });
  if (product.plates?.length) {
    const combo = choose(optionsOf(product, filaments, printers, kwhPrice, waste), partsOf(product), product.extra_cost, true);
    if (combo) return withSupplies(combo.cost);
  }
  const assigned = printers.filter((printer) => product.printer_ids.includes(printer.id));
  return withSupplies(breakdown(product.filaments, product.print_minutes, assigned, filaments, kwhPrice, product.extra_cost));
}

/** What one unit of a supply costs: from its purchases, or the reference while it has none. */
export function materialUnitCost(material: Pick<Material, 'avg_cost_per_unit' | 'cost_per_unit'>) {
  return material.avg_cost_per_unit > 0 ? Number(material.avg_cost_per_unit) : Number(material.cost_per_unit);
}

/** The supplies one product takes, at their unit cost. */
export function suppliesCost(uses: MaterialUse[] | undefined, materials: Material[]) {
  return (uses ?? []).reduce((total, use) => {
    const material = materials.find((item) => item.id === use.material_id);
    return total + (material ? materialUnitCost(material) * use.quantity : 0);
  }, 0);
}

/** Commission and taxes that go out of a sale in the channel (shipping is counted apart). */
export function channelFees(channel: Channel | undefined, unitPrice: number, quantity = 1) {
  if (!channel) return 0;
  return quantity * ((unitPrice * (channel.commission_pct + (channel.tax_pct ?? 0))) / 100 + channel.fixed_fee);
}

/**
 * What sending one order costs the seller: the channel's shipping plus the product's packaging.
 * Prices "sin envío" leave it out (the buyer picks up or pays shipping); "con envío" add it.
 */
export function shippingCost(channel: Channel, packaging: Packaging | undefined) {
  return channel.shipping_cost + (packaging?.cost ?? 0);
}

/**
 * Weight a package ships at, in kg: the plastic of the product plus the empty package, or its
 * volumetric weight (length × width × height in cm ÷ divisor) when that is larger.
 */
export function shippingWeight(productGrams: number, packaging: Packaging | undefined, divisor: number) {
  const physical = (productGrams + Number(packaging?.weight_g ?? 0)) / 1000;
  const cm = packaging ? [packaging.length_mm, packaging.width_mm, packaging.height_mm].map((value) => Number(value) / 10) : [];
  const volumetric = cm.length && cm.every((value) => value > 0) ? (cm[0] * cm[1] * cm[2]) / divisor : 0;
  return Math.max(physical, volumetric);
}

/** What a carrier charges for `kg` sold at `price`; null when it has no rate for that weight. */
export function carrierRate(carrier: Carrier, kg: number, price: number): number | null {
  const row = carrier.weights.findIndex((limit) => kg <= Number(limit) + 1e-9);
  if (row < 0) return null;
  let column = 0;
  if (carrier.prices.length) {
    column = carrier.prices.findIndex((limit) => price <= Number(limit) + 1e-9);
    // Above the last price column: the last one (its table usually ends open-ended).
    if (column < 0) column = carrier.prices.length - 1;
  }
  const value = carrier.rates[row]?.[column];
  return value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value);
}

export type ShippingQuote = { carrier: Carrier; cost: number; kg: number };

/** What each carrier of the channel charges to send the product at `price`, cheapest first. */
export function shippingQuotes(channel: Channel, carriers: Carrier[], productGrams: number, packaging: Packaging | undefined, price: number): ShippingQuote[] {
  return carriers
    .filter((carrier) => channel.carrier_ids?.includes(carrier.id))
    .flatMap((carrier) => {
      const kg = shippingWeight(productGrams, packaging, Number(carrier.divisor) || 5000);
      const cost = carrierRate(carrier, kg, price);
      return cost === null ? [] : [{ carrier, cost, kg }];
    })
    .sort((a, b) => a.cost - b.cost);
}

/**
 * Shipping of one sale: the dearest carrier of the channel (so prices always cover it), or the
 * channel's fixed shipping when it has no carriers, plus the package.
 */
export function shippingFor(channel: Channel, carriers: Carrier[], productGrams: number, packaging: Packaging | undefined, price: number) {
  const quotes = shippingQuotes(channel, carriers, productGrams, packaging, price);
  const carrierCost = channel.carrier_ids?.length && quotes.length ? quotes[quotes.length - 1].cost : channel.shipping_cost;
  return carrierCost + (packaging?.cost ?? 0);
}

/**
 * Suggested price with shipping: the same pesos of profit as the price without shipping, plus the
 * shipping and what the channel takes of it (commission and taxes) — the profit is not asked of the
 * shipping. When the carrier charges by the price range it is worked out a few times until it settles.
 */
export function suggestedPriceWithShipping(cost: number, channel: Channel, marginPct: number, shippingAt: (price: number) => number) {
  const plain = suggestedPrice(cost, channel, marginPct);
  const profit = (plain * marginPct) / 100;
  const kept = 1 - (channel.commission_pct + (channel.tax_pct ?? 0)) / 100;
  if (kept <= 0.01 || plain <= 0) return 0;
  const priceFor = (shipping: number) => (cost + channel.fixed_fee + shipping + profit) / kept;
  let price = priceFor(shippingAt(plain));
  for (let round = 0; round < 8; round++) {
    const next = priceFor(shippingAt(price));
    if (Math.abs(next - price) < 0.005) return next;
    // Between two price ranges it could bounce: keep the higher, so the shipping is always covered.
    price = Math.max(price, next);
  }
  return price;
}

/** What is left from selling one piece at `price` after commission, `shipping` and production. */
export function unitProfit(price: number, cost: number, channel: Channel, shipping = 0) {
  return price - channelFees(channel, price) - shipping - cost;
}

/**
 * Price that leaves `marginPct` percent of the price itself as profit once the product, the
 * channel's commission, taxes and fixed fee, and `shipping` are paid: sell at 100 with 50 of costs
 * and the profit is 50 %. 0 when the channel and margin leave nothing to price with.
 */
export function suggestedPrice(cost: number, channel: Channel, marginPct: number, shipping = 0) {
  const kept = 1 - (channel.commission_pct + (channel.tax_pct ?? 0)) / 100 - marginPct / 100;
  if (kept <= 0.01) return 0;
  return (cost + channel.fixed_fee + shipping) / kept;
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
