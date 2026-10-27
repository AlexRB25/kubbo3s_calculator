import { router } from 'expo-router';
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import type {
  Carrier,
  Channel,
  Expense,
  Filament,
  Maintenance,
  Material,
  Packaging,
  PrinterWear,
  PrintJob,
  Printer,
  Product,
  Profile,
  Sale,
  ShopInfo,
  Supplier,
} from '@/lib/types';

type Tables = {
  /** The shop's owner profile: its settings (light, margin, fixed costs…) apply to everyone working in it. */
  profile: Profile | null;
  /** The shop the user works in now and their role there. */
  shop: ShopInfo | null;
  suppliers: Supplier[];
  printers: Printer[];
  filaments: Filament[];
  channels: Channel[];
  products: Product[];
  jobs: PrintJob[];
  sales: Sale[];
  maintenance: Maintenance[];
  expenses: Expense[];
  packaging: Packaging[];
  /** Supplies (LEDs, bulbs, screws…) and other raw materials. */
  materials: Material[];
  /** Wear fund of the printers: wear of each print and the payments into it. */
  wear: PrinterWear[];
  /** Carriers and their rates, linked to the sales channels. */
  carriers: Carrier[];
};

type DataState = Tables & {
  /** True only during the first load. */
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
};

const EMPTY: Tables = {
  profile: null,
  shop: null,
  suppliers: [],
  printers: [],
  filaments: [],
  channels: [],
  products: [],
  jobs: [],
  sales: [],
  maintenance: [],
  expenses: [],
  packaging: [],
  materials: [],
  wear: [],
  carriers: [],
};

/** History tables load their most recent rows; older ones stay in the database. */
const HISTORY_LIMIT = 1000;

const DataContext = createContext<DataState | null>(null);

export function useData(): DataState {
  const value = use(DataContext);
  if (!value) throw new Error('useData debe usarse dentro de <DataProvider>');
  return value;
}

type Loaded = { tables: Tables; error?: undefined } | { tables?: undefined; error: string };

async function fetchTables(userId: string): Promise<Loaded> {
  // Every table is the active shop's (the database decides); without my_shop (older schema) it is their own.
  const mine = await supabase.rpc('my_shop');
  const shop: ShopInfo = mine.data ?? { shop_id: userId, role: 'owner', shops: [], seats: null };
  const [profile, suppliers, printers, filaments, channels, products, jobs, sales, maintenance, expenses, packaging, materials, wear, carriers] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', shop.shop_id).maybeSingle(),
    supabase.from('suppliers').select('*').order('name'),
    supabase.from('printers').select('*').order('name'),
    supabase.from('filaments').select('*').order('material').order('color'),
    supabase.from('channels').select('*').order('sort').order('name'),
    supabase.from('products').select('*').order('name'),
    supabase
      .from('print_jobs')
      .select('*, print_job_filaments(filament_id, filament_name, grams, cost)')
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase.from('sales').select('*').order('sold_at', { ascending: false }).limit(HISTORY_LIMIT),
    supabase.from('maintenance').select('*').order('performed_at', { ascending: false }).limit(HISTORY_LIMIT),
    supabase.from('expenses').select('*').order('spent_at', { ascending: false }).limit(HISTORY_LIMIT),
    supabase.from('packaging').select('*').order('name'),
    supabase.from('materials').select('*').order('name'),
    supabase.from('printer_wear').select('*').order('happened_at', { ascending: false }).limit(HISTORY_LIMIT),
    supabase.from('carriers').select('*').order('name'),
  ]);

  const failed = [profile, suppliers, printers, filaments, channels, products, jobs, sales, maintenance, expenses, packaging, materials, wear, carriers].find(
    (result) => result.error,
  );
  if (failed?.error) return { error: `No se pudieron cargar tus datos: ${failed.error.message}` };
  return {
    tables: {
      profile: profile.data,
      shop,
      suppliers: suppliers.data ?? [],
      printers: printers.data ?? [],
      filaments: filaments.data ?? [],
      channels: channels.data ?? [],
      products: products.data ?? [],
      jobs: jobs.data ?? [],
      sales: sales.data ?? [],
      maintenance: maintenance.data ?? [],
      expenses: expenses.data ?? [],
      packaging: packaging.data ?? [],
      materials: materials.data ?? [],
      wear: wear.data ?? [],
      carriers: carriers.data ?? [],
    },
  };
}

/**
 * Everything the signed-in user owns, loaded once and refreshed after each write. A workshop's
 * data is small, so screens read from here instead of querying one by one.
 */
export function DataProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const [tables, setTables] = useState<Tables>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const loaded = await fetchTables(userId);
    // A failed refresh keeps showing the data already on screen.
    if (loaded.tables) setTables(loaded.tables);
    setError(loaded.error ?? '');
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const open = () => {
      // Usage metrics for the dashboard; losing one ping is harmless.
      supabase.rpc('touch').then(() => {});
      reload();
    };
    Promise.resolve().then(open);
    // Coming back from the background counts as a visit and may have missed changes from another device.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') open();
    });
    return () => subscription.remove();
  }, [reload]);

  return <DataContext value={{ ...tables, loading, error, reload }}>{children}</DataContext>;
}
type WriteResult = { error: { message: string } | null };

/** Shared flow of every form: run the write, refresh the data, leave the screen. */
export function useSave() {
  const { reload } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(write: () => PromiseLike<WriteResult>, done: () => void = router.back) {
    setBusy(true);
    setError('');
    // Supabase reports failures in `error`; a throw means the request never left (e.g. no network).
    const result = await Promise.resolve()
      .then(write)
      .catch((): WriteResult => ({ error: { message: 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.' } }));
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    await reload();
    setBusy(false);
    done();
  }

  return { busy, error, setError, save };
}
