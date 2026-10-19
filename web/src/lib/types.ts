// Rows as they come from Supabase (see supabase/schema.sql).

export type Profile = {
  id: string;
  email: string;
  name: string;
  business_name: string;
  kwh_price: number;
  margin_pct: number;
};

export type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  url: string;
  notes: string;
};

export type Printer = {
  id: string;
  name: string;
  model: string;
  power_watts: number;
  hourly_cost: number;
  print_minutes: number;
  notes: string;
};

export type Filament = {
  id: string;
  brand: string;
  material: string;
  color: string;
  color_hex: string;
  supplier_id: string | null;
  stock_g: number;
  /** Reference: what a kilo usually costs, as the user typed it. */
  cost_per_kg: number;
  /** Real cost of one gram from all purchases (total paid ÷ grams bought); 0 before the first one. */
  avg_cost_per_g: number;
  low_stock_g: number;
  notes: string;
  /** Photo of the spool (an upload of the user, or the one of the Kubbo catalog). */
  image_url: string | null;
  /** The Kubbo catalog filament it was created from. */
  catalog_id: string | null;
};

/** A filament Kubbo3D preloads for everyone to pick (table filament_catalog). */
export type CatalogFilament = {
  id: string;
  brand: string;
  material: string;
  color_name: string;
  color_hex: string;
  image_url: string | null;
  spool_g: number;
  reference_price_kg: number;
  nozzle_temp: string;
  bed_temp: string;
  notes: string;
};

export type Channel = {
  id: string;
  name: string;
  commission_pct: number;
  fixed_fee: number;
  shipping_cost: number;
  sort: number;
};

export type PackagingKind = 'box' | 'envelope' | 'bag' | 'other';

export type Packaging = {
  id: string;
  name: string;
  kind: PackagingKind;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  cost: number;
  notes: string;
};

export type FilamentUse = { filament_id: string; grams: number };

export type Product = {
  id: string;
  name: string;
  sku: string;
  description: string;
  image_path: string | null;
  print_minutes: number;
  extra_cost: number;
  stock: number;
  /** Grams of each filament one piece takes. */
  filaments: FilamentUse[];
  printer_ids: string[];
  /** Selling price by channel id. */
  prices: Record<string, number>;
  /** Packaging it ships in; counts toward the "with shipping" price. */
  packaging_id: string | null;
};

export type PrintStatus = 'printing' | 'done' | 'failed';

export type PrintJob = {
  id: string;
  product_id: string | null;
  product_name: string;
  printer_id: string | null;
  quantity: number;
  good_quantity: number;
  status: PrintStatus;
  minutes: number;
  notes: string;
  created_at: string;
  print_job_filaments: { filament_id: string | null; filament_name: string; grams: number; cost: number }[];
};

export type Sale = {
  id: string;
  product_id: string | null;
  product_name: string;
  channel_id: string | null;
  channel_name: string;
  quantity: number;
  unit_price: number;
  fees: number;
  shipping_cost: number;
  unit_cost: number;
  packaging_cost: number;
  profit: number;
  notes: string;
  sold_at: string;
};

export type MaintenanceKind = 'maintenance' | 'adjustment' | 'repair';

export type Maintenance = {
  id: string;
  printer_id: string;
  kind: MaintenanceKind;
  title: string;
  notes: string;
  cost: number;
  performed_at: string;
  next_due: string | null;
};

export type ExpenseCategory = 'filament' | 'material' | 'parts' | 'electricity' | 'shipping' | 'packaging' | 'maintenance' | 'other';

export type Expense = {
  id: string;
  category: ExpenseCategory;
  amount: number;
  note: string;
  spent_at: string;
  supplier_id: string | null;
  printer_id: string | null;
  filament_id: string | null;
  grams: number | null;
  /** Purchase of another raw material: which one and how many of its unit. */
  material_id: string | null;
  quantity: number | null;
  maintenance_id: string | null;
};

/** A raw material other than filament (resin, magnets, screws, paint…). */
export type Material = {
  id: string;
  name: string;
  category: string;
  unit: 'g' | 'ml' | 'pza';
  stock: number;
  /** Reference: what one unit (gram, millilitre or piece) usually costs, as the user typed it. */
  cost_per_unit: number;
  /** Real cost of one unit from all purchases; 0 before the first one. */
  avg_cost_per_unit: number;
  low_stock: number;
  supplier_id: string | null;
  notes: string;
};

export type InventoryItemType = 'filament' | 'material' | 'product';

/** One movement of stock, from the inventory_moves view. Quantity is signed. */
export type InventoryMove = {
  id: string;
  item_type: InventoryItemType;
  item_id: string;
  kind: 'purchase' | 'print' | 'production' | 'sale' | 'adjustment';
  quantity: number;
  total: number | null;
  moved_at: string;
  note: string | null;
  supplier_id: string | null;
};
