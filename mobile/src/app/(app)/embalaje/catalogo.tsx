import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BoxPreview, BoxThumb } from '@/components/box-preview';
import { Button, Card, Chips, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fromMxn, loadRates } from '@/lib/currency';
import { getWorkshopCurrency, money, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { CatalogPackaging } from '@/lib/types';
import { useData, useSave } from '@/store/data';

type Group = 'all' | 'envio' | 'maletin' | 'plana';
const GROUPS: { value: Group; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'envio', label: 'De envío' },
  { value: 'maletin', label: 'Maletín' },
  { value: 'plana', label: 'Planas' },
];

/** Flat ones (pizza, frames) are much lower than they are wide. */
function groupOf(item: CatalogPackaging): Group {
  if (item.style === 'mailer' && Number(item.height_mm) * 5 <= Math.min(Number(item.length_mm), Number(item.width_mm))) return 'plana';
  return item.style === 'mailer' ? 'maletin' : 'envio';
}

const cm = (mm: number) => `${Math.round(Number(mm)) / 10}`.replace(/\.0$/, '');
const measures = (item: CatalogPackaging) => `${cm(item.length_mm)}×${cm(item.width_mm)}×${cm(item.height_mm)} cm`;

/** Boxes Kubbo3D keeps ready: pick one, see it in 3D, and add it to your packaging at the price you pay. */
export default function PackagingCatalogScreen() {
  const { packaging } = useData();
  const [catalog, setCatalog] = useState<CatalogPackaging[] | null>(null);
  const [failure, setFailure] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group>('all');
  const [picked, setPicked] = useState<CatalogPackaging | null>(null);
  const [rates, setRates] = useState<Awaited<ReturnType<typeof loadRates>> | null>(null);
  const currency = getWorkshopCurrency();

  useEffect(() => {
    let current = true;
    supabase
      .from('packaging_catalog')
      .select('*')
      .order('sort')
      .then(({ data, error }) => {
        if (!current) return;
        if (error) setFailure(error.code === '42P01' ? 'Falta actualizar la base de datos (supabase/schema.sql) para ver el catálogo.' : error.message);
        else setCatalog((data ?? []) as CatalogPackaging[]);
      });
    loadRates()
      .then((loaded) => current && setRates(loaded))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  // Reference prices are in Mexican pesos; shown in the workshop's currency.
  const local = (mxn: number | null) => (mxn === null ? null : rates ? fromMxn(Number(mxn), currency, rates) : currency === 'MXN' ? Number(mxn) : null);

  if (picked) return <CatalogBox item={picked} price={local(picked.price_mxn)} wholesale={local(picked.wholesale_price_mxn)} onBack={() => setPicked(null)} />;

  const needle = query.trim().toLowerCase();
  const shown = (catalog ?? []).filter(
    (item) => (group === 'all' || groupOf(item) === group) && (!needle || `${item.name} ${measures(item)} ${item.notes}`.toLowerCase().includes(needle)),
  );
  const added = new Set(packaging.map((item) => item.catalog_id).filter(Boolean));

  return (
    <Screen>
      <Muted>Cajas con medidas y precios de referencia de tiendas de empaque. Toca una para verla en 3D y agregarla con el precio que tú pagas.</Muted>
      <Field label="Buscar" value={query} onChangeText={setQuery} placeholder="20×20, pizza, maletín…" />
      <Chips options={GROUPS} value={group} onChange={setGroup} />
      <ErrorText>{failure}</ErrorText>
      {!catalog && !failure && <Muted>Cargando el catálogo…</Muted>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {shown.map((item) => {
          const price = local(item.price_mxn);
          const wholesale = local(item.wholesale_price_mxn);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => setPicked(item)}
              style={({ pressed }) => ({
                width: '48%',
                flexGrow: 1,
                alignItems: 'center',
                gap: Spacing.one,
                padding: Spacing.two,
                borderRadius: Radius.medium,
                borderWidth: 1,
                borderColor: Colors.border,
                backgroundColor: Colors.surface,
                opacity: pressed ? 0.6 : 1,
              })}>
              <BoxThumb box={item} size={84} />
              <Text style={{ color: Colors.text, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{measures(item)}</Text>
              <Text style={{ color: Colors.text, fontSize: 12 }}>
                {price !== null ? money(price) : 'Sin precio'}
                {wholesale !== null ? <Text style={{ color: Colors.money }}> · {money(wholesale)} may.</Text> : null}
              </Text>
              {added.has(item.id) && <Text style={{ color: Colors.accent, fontSize: 11, fontWeight: '700' }}>Ya la tienes</Text>}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function CatalogBox({ item, price, wholesale, onBack }: { item: CatalogPackaging; price: number | null; wholesale: number | null; onBack: () => void }) {
  const { busy, error, save } = useSave();
  const [which, setWhich] = useState<'piece' | 'wholesale' | 'own'>(price !== null ? 'piece' : 'own');
  const [own, setOwn] = useState('');
  const [name, setName] = useState(item.name);
  const [stock, setStock] = useState('');
  const cost = which === 'piece' ? (price ?? 0) : which === 'wholesale' ? (wholesale ?? 0) : num(own);

  const options = [
    ...(price !== null ? [{ value: 'piece' as const, label: `Por pieza ${money(price)}` }] : []),
    ...(wholesale !== null ? [{ value: 'wholesale' as const, label: `Mayoreo ${money(wholesale)}${item.wholesale_min ? ` (desde ${item.wholesale_min})` : ''}` }] : []),
    { value: 'own' as const, label: 'Otro precio' },
  ];

  return (
    <Screen>
      <BoxPreview box={item} size={240} />
      <Card>
        <Field label="Nombre en tu embalaje" value={name} onChangeText={setName} />
        {item.notes ? <Muted>{item.notes}</Muted> : null}
        <Chips label="¿Cuánto te cuesta cada una?" options={options} value={which} onChange={setWhich} />
        {which === 'own' && <Field label="Tu precio por pieza" unit="$" numeric value={own} onChangeText={setOwn} placeholder="0" />}
        {price === null && <Muted>No tenemos su precio; escribe lo que te cuesta en tu tienda.</Muted>}
        <Muted>Precios de referencia de una tienda de empaques; pueden variar en la tuya.</Muted>
        <Field label="Piezas que tienes" numeric value={stock} onChangeText={setStock} placeholder="0" />
      </Card>
      <ErrorText>{error}</ErrorText>
      <Button
        icon="add"
        label={`Agregar a mi embalaje · ${money(cost)}`}
        loading={busy}
        onPress={() =>
          save(
            () =>
              supabase.from('packaging').insert({
                name: name.trim() || item.name,
                kind: item.kind,
                length_mm: item.length_mm,
                width_mm: item.width_mm,
                height_mm: item.height_mm,
                cost: Math.round(cost * 100) / 100,
                stock: Math.round(num(stock)),
                weight_g: item.weight_g,
                notes: item.notes,
                catalog_id: item.id,
                style: item.style,
                material: item.material,
              }),
            () => router.back(),
          )
        }
      />
      <Button variant="secondary" label="Volver al catálogo" onPress={onBack} />
    </Screen>
  );
}
