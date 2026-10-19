import type { Channel, Filament, Packaging, Printer, Product } from './types';

export type CostBreakdown = {
  filament: number;
  electricity: number;
  machine: number;
  extra: number;
  total: number;
};

type Recipe = Pick<Product, 'filaments' | 'printer_ids' | 'print_minutes' | 'extra_cost'> & { plates?: Product['plates'] };

/**
 * Filament and time one piece takes on a printer: the sum of its plates there. Products without
 * plates on that printer use their general recipe.
 */
export function recipeFor(product: Pick<Product, 'filaments' | 'print_minutes'> & { plates?: Product['plates'] }, printerId?: string | null) {
  const plates = (product.plates ?? []).filter((plate) => plate.printer_id === printerId);
  if (!plates.length) return { filaments: product.filaments, minutes: product.print_minutes };
  const grams = new Map<string, number>();
  for (const plate of plates)
    for (const [filamentId, amount] of Object.entries(plate.grams)) grams.set(filamentId, (grams.get(filamentId) ?? 0) + (Number(amount) || 0));
  return {
    filaments: [...grams].filter(([, amount]) => amount > 0).map(([filament_id, amount]) => ({ filament_id, grams: amount })),
    minutes: plates.reduce((total, plate) => total + plate.minutes, 0),
  };
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

/** What one piece costs on one printer, from its plates there. */
export function costOnPrinter(product: Recipe, printer: Printer, filaments: Filament[], kwhPrice: number) {
  const recipe = recipeFor(product, printer.id);
  return breakdown(recipe.filaments, recipe.minutes, [printer], filaments, kwhPrice, product.extra_cost);
}

/**
 * What one piece costs to make. With plates, it is the average of what it costs on each printer
 * that has them, since any of them may end up printing it. Older products without plates use one
 * recipe and the average electricity and wear of their printers.
 */
export function productCost(product: Recipe, filaments: Filament[], printers: Printer[], kwhPrice: number): CostBreakdown {
  const plated = printers.filter((printer) => product.plates?.some((plate) => plate.printer_id === printer.id));
  if (plated.length) {
    const each = plated.map((printer) => costOnPrinter(product, printer, filaments, kwhPrice));
    const mean = (pick: (cost: CostBreakdown) => number) => each.reduce((total, cost) => total + pick(cost), 0) / each.length;
    return { filament: mean((cost) => cost.filament), electricity: mean((cost) => cost.electricity), machine: mean((cost) => cost.machine), extra: product.extra_cost, total: mean((cost) => cost.total) };
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
