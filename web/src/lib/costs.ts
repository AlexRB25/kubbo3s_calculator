import type { Channel, Filament, Printer, Product } from './types';

export type CostBreakdown = {
  filament: number;
  electricity: number;
  machine: number;
  extra: number;
  total: number;
};

type Recipe = Pick<Product, 'filaments' | 'printer_ids' | 'print_minutes' | 'extra_cost'>;

/**
 * What one piece costs to make. With several printers assigned, electricity and wear use
 * their average, since any of them may end up printing it.
 */
export function productCost(product: Recipe, filaments: Filament[], printers: Printer[], kwhPrice: number): CostBreakdown {
  const filament = product.filaments.reduce((total, use) => {
    const perKg = filaments.find((item) => item.id === use.filament_id)?.cost_per_kg ?? 0;
    return total + (use.grams / 1000) * perKg;
  }, 0);

  const assigned = printers.filter((printer) => product.printer_ids.includes(printer.id));
  const average = (pick: (printer: Printer) => number) =>
    assigned.length ? assigned.reduce((total, printer) => total + pick(printer), 0) / assigned.length : 0;
  const hours = product.print_minutes / 60;
  const electricity = hours * (average((printer) => printer.power_watts) / 1000) * kwhPrice;
  const machine = hours * average((printer) => printer.hourly_cost);

  const extra = product.extra_cost;
  return { filament, electricity, machine, extra, total: filament + electricity + machine + extra };
}

/** Commission the channel keeps on a sale (shipping is counted apart). */
export function channelFees(channel: Channel | undefined, unitPrice: number, quantity = 1) {
  if (!channel) return 0;
  return quantity * ((unitPrice * channel.commission_pct) / 100 + channel.fixed_fee);
}

/** What is left from selling one piece at `price` after commission, shipping and production. */
export function unitProfit(price: number, cost: number, channel: Channel) {
  return price - channelFees(channel, price) - channel.shipping_cost - cost;
}

/** Price that leaves `marginPct` percent of the cost as profit once the channel takes its cut. */
export function suggestedPrice(cost: number, channel: Channel, marginPct: number) {
  const kept = 1 - channel.commission_pct / 100;
  if (kept <= 0) return 0;
  return (cost * (1 + marginPct / 100) + channel.fixed_fee + channel.shipping_cost) / kept;
}

export function filamentName(filament: Filament) {
  return [filament.material, filament.color, filament.brand].filter(Boolean).join(' ');
}
