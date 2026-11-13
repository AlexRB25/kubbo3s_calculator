import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, ErrorText, Field, Muted, Screen, Swatch } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fromMxn, loadRates } from '@/lib/currency';
import { getWorkshopCurrency } from '@/lib/format';
import { filamentColors } from '@/lib/labels';
import { supabase } from '@/lib/supabase';
import type { CatalogFilament } from '@/lib/types';
import { useData, useSave } from '@/store/data';

/** The workshop's filament for a catalog one, with 0 g (same as the web's catalogFilamentRow). */
const catalogFilamentRow = (item: CatalogFilament, costPerKg: number) => ({
  material: item.material,
  brand: item.brand,
  color: item.color_name,
  color_hex: item.color_hex,
  extra_colors: item.extra_colors ?? [],
  glow: item.glow,
  image_url: item.image_url,
  catalog_id: item.id,
  cost_per_kg: Math.round(costPerKg * 100) / 100,
  low_stock_g: Math.round(Number(item.spool_g || 1000) * 0.2),
  notes: [item.nozzle_temp && `Boquilla ${item.nozzle_temp}`, item.bed_temp && `Cama ${item.bed_temp}`, item.notes].filter(Boolean).join(' · '),
  stock_g: 0,
});

/**
 * Brings several filaments of the Kubbo catalog at once. The ones already brought (same catalog_id) are never
 * touched, so stock, prices and edits stay; running it again only adds what Kubbo added since.
 */
export default function FilamentCatalogScreen() {
  const { filaments } = useData();
  const { busy, error, save } = useSave();
  const [catalog, setCatalog] = useState<CatalogFilament[] | null>(null);
  const [failure, setFailure] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [rates, setRates] = useState<Awaited<ReturnType<typeof loadRates>> | null>(null);
  const currency = getWorkshopCurrency();

  useEffect(() => {
    let current = true;
    supabase
      .from('filament_catalog')
      .select('*')
      .order('brand')
      .order('material')
      .order('sort')
      .order('color_name')
      .then(({ data, error: failed }) => {
        if (!current) return;
        if (failed) setFailure(`No se pudo leer el catálogo: ${failed.message}`);
        else setCatalog((data ?? []) as CatalogFilament[]);
      });
    loadRates()
      .then((loaded) => current && setRates(loaded))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  const added = new Set(filaments.map((item) => item.catalog_id).filter(Boolean));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (catalog ?? []).filter((item) => words.every((word) => `${item.brand} ${item.material} ${item.color_name}`.toLowerCase().includes(word)));
  const missing = shown.filter((item) => !added.has(item.id));
  const ticked = chosen.filter((id) => !added.has(id));
  const hasSome = (catalog ?? []).some((item) => added.has(item.id));
  const toggle = (id: string) => setChosen((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  // The catalog's reference is in Mexican pesos.
  const local = (mxn: number) => (rates ? fromMxn(Number(mxn) || 0, currency, rates) : currency === 'MXN' ? Number(mxn) || 0 : 0);

  function addMany(list: CatalogFilament[]) {
    const rows = list.filter((item) => !added.has(item.id)).map((item) => catalogFilamentRow(item, local(item.reference_price_kg)));
    if (!rows.length) return;
    Alert.alert(`¿Agregar ${rows.length === 1 ? '1 filamento' : `${rows.length} filamentos`}?`, 'Entran con 0 g y su precio de referencia. Los que ya tienes no se tocan.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Agregar', onPress: () => save(() => supabase.from('filaments').insert(rows), () => router.back()) },
    ]);
  }

  return (
    <Screen>
      <Muted>
        Toca los que usas o agrégalos todos. Entran con 0 g: tu existencia la pones con una compra o un arqueo. Si ya importaste antes, solo se agregan los nuevos; lo que
        ya tienes no se cambia ni se borra.
      </Muted>
      <Field label="Buscar" value={query} onChangeText={setQuery} placeholder="elegoo gris, petg negro…" />
      <ErrorText>{failure || error}</ErrorText>
      {!catalog && !failure && <Muted>Cargando catálogo…</Muted>}
      {catalog && (
        <View style={{ gap: Spacing.two }}>
          <Button
            icon="add"
            label={`Agregar seleccionados (${ticked.length})`}
            loading={busy}
            disabled={!ticked.length}
            onPress={() => addMany(catalog.filter((item) => chosen.includes(item.id)))}
          />
          <Button
            variant="secondary"
            disabled={busy || !missing.length}
            label={!missing.length ? 'Ya los tienes todos' : `${hasSome ? 'Agregar los que me faltan' : 'Agregar todos'}${words.length ? ' de la búsqueda' : ''} (${missing.length})`}
            onPress={() => addMany(missing)}
          />
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {shown.map((item) => {
          const have = added.has(item.id);
          const on = !have && chosen.includes(item.id);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: have }}
              disabled={have}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => ({
                width: '48%',
                flexGrow: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.two,
                padding: Spacing.two,
                borderRadius: Radius.medium,
                borderWidth: 1,
                borderColor: on ? Colors.accent : Colors.border,
                backgroundColor: on ? Colors.accentSoft : Colors.surface,
                opacity: pressed ? 0.6 : have ? 0.5 : 1,
              })}>
              <Swatch colors={filamentColors(item)} glow={item.glow} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontWeight: '700' }} numberOfLines={1}>
                  {item.brand} {item.material}
                </Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {item.color_name}
                </Text>
                {have && <Text style={{ color: Colors.accent, fontSize: 11, fontWeight: '700' }}>Ya lo tienes</Text>}
              </View>
              {on && <Text style={{ color: Colors.accent, fontWeight: '800' }}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
