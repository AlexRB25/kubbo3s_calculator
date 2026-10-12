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
  cost_per_kg: number;
  low_stock_g: number;
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

export type ExpenseCategory = 'filament' | 'parts' | 'electricity' | 'shipping' | 'packaging' | 'maintenance' | 'other';

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
  maintenance_id: string | null;
};
