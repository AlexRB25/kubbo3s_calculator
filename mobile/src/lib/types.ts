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

/** A printer model Kubbo3D keeps up to date for users to pick. */
export type CatalogPrinter = { id: string; brand: string; model: string; power_watts: number; notes: string; sort: number };

export type Printer = {
  id: string;
  /** Built from brand, model and device id ("Bambu Lab A1 · 605"). */
  name: string;
  brand: string;
  model: string;
  /** Serial number or device id, to tell two equal printers apart. */
  device_id: string;
  catalog_id: string | null;
  power_watts: number;
  hourly_cost: number;
  print_minutes: number;
  /** Hours it already had when registered, in minutes; they add to print_minutes. */
  initial_minutes: number;
  /** What the printer cost and the hours it is expected to last: they give the wear per hour. */
  purchase_price: number;
  life_hours: number;
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

/** How many units of a supply (LED, bulb, screw…) one product takes. */
export type MaterialUse = { material_id: string; quantity: number };

/** A piece the product is made of, and how many of it one product takes. */
export type Part = { id: string; name: string; needed: number };

/**
 * One build plate on one printer: its time, the grams of each filament the product uses (0 if it
 * is not on this plate) and how many of each piece it prints. Without `parts` it prints one whole product.
 */
export type Plate = { printer_id: string; name: string; minutes: number; grams: Record<string, number>; parts?: Record<string, number> };

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
  /** Supplies one product takes (LEDs, bulbs, screws…): their cost adds to the product's. */
  materials: MaterialUse[];
  /** More photos after the cover (`image_path`), in order. */
  image_paths: string[];
  /** Categories it belongs to (several allowed): from the Kubbo3D list or typed by the user. */
  categories: string[];
  /** Pieces it is made of; empty for a single piece. */
  parts: Part[];
  /** Plates on each printer; filaments and print_minutes are what falls on one product in the dearest way. */
  plates: Plate[];
  /** Printed pieces that do not complete a product yet, by part id. */
  part_stock: Record<string, number>;
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
  /** Plate printed `quantity` times; its good prints add loose pieces. Null when whole products were printed. */
  plate: { name: string; parts: Record<string, number> } | null;
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
  /** The channel price when it was sold; with unit_price it tells the discount. */
  list_price: number | null;
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
