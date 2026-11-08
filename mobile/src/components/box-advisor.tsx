import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Chips, Field, Muted, Row } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { boxesFor, kg, parcelWeights, PROTECTIONS, sizeLabel, VOLUMETRIC_DIVISOR } from '@/lib/box-fit';
import { packagingName } from '@/lib/costs';
import { money, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { CatalogPackaging, Packaging } from '@/lib/types';

export type SizeDraft = { length: string; width: string; height: string; margin: string };

const mm = (cm: string) => Math.round(num(cm) * 10);
const cmText = (value: number) => `${Math.round(value) / 10}`.replace(/\.0$/, '');

/**
 * The finished product's measures and how it goes protected, and the smallest of the workshop's boxes it fits
 * in. When none does, it says so and suggests boxes of the Kubbo catalog that would.
 */
export function BoxAdvisor({
  draft,
  onChange,
  packaging,
  chosen,
  onPick,
  hint,
}: {
  draft: SizeDraft;
  onChange: (draft: SizeDraft) => void;
  packaging: Packaging[];
  chosen: string | null;
  onPick: (id: string) => void;
  hint?: string;
}) {
  const size: [number, number, number] = [mm(draft.length), mm(draft.width), mm(draft.height)];
  const margin = mm(draft.margin);
  const ready = size.every((value) => value > 0);
  const fitting = ready ? boxesFor(size, packaging, margin) : [];
  const best = fitting[0];
  const [catalog, setCatalog] = useState<CatalogPackaging[] | null>(null);
  const needCatalog = ready && !best;

  useEffect(() => {
    if (!needCatalog || catalog) return;
    let current = true;
    supabase
      .from('packaging_catalog')
      .select('*')
      .order('sort')
      .then(({ data }) => current && setCatalog((data ?? []) as CatalogPackaging[]));
    return () => {
      current = false;
    };
  }, [needCatalog, catalog]);

  const fromCatalog = needCatalog && catalog ? boxesFor(size, catalog as unknown as Packaging[], margin).slice(0, 3) : [];
  const set = (patch: Partial<SizeDraft>) => onChange({ ...draft, ...patch });
  const protectedSize = sizeLabel(size.map((value) => value + margin));
  const preset = PROTECTIONS.find((option) => option.value === margin);

  return (
    <View style={{ gap: Spacing.two, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.medium, padding: Spacing.three }}>
      <Text style={{ color: Colors.text, fontWeight: '700' }}>Medidas del producto armado</Text>
      <Muted>{hint ?? 'Con ellas te decimos qué caja de tu embalaje usar.'}</Muted>
      <Row>
        <Field style={{ flex: 1 }} label="Largo" unit="cm" numeric value={draft.length} onChangeText={(length) => set({ length })} placeholder="0" />
        <Field style={{ flex: 1 }} label="Ancho" unit="cm" numeric value={draft.width} onChangeText={(width) => set({ width })} placeholder="0" />
        <Field style={{ flex: 1 }} label="Alto" unit="cm" numeric value={draft.height} onChangeText={(height) => set({ height })} placeholder="0" />
      </Row>
      <Chips
        label="¿Cómo va protegido?"
        options={[...PROTECTIONS.map((option) => ({ value: String(option.value), label: `${option.label} ${option.hint}` })), { value: 'otra', label: 'Otra' }]}
        value={preset ? String(preset.value) : 'otra'}
        onChange={(value) => set({ margin: value === 'otra' ? draft.margin : String(Number(value) / 10) })}
      />
      {!preset && <Field label="Holgura" unit="cm" numeric value={draft.margin} onChangeText={(value) => set({ margin: value })} hint="Se suma a cada medida." />}

      {ready &&
        (best ? (
          <View style={{ gap: Spacing.two, backgroundColor: Colors.moneySoft, borderRadius: Radius.small, padding: Spacing.three }}>
            <Text style={{ color: Colors.text }}>
              {best.box.id === chosen ? 'Usas la caja recomendada: ' : 'Te recomendamos: '}
              <Text style={{ fontWeight: '700' }}>{packagingName(best.box)}</Text> · {money(best.box.cost)}
            </Text>
            <Muted>
              Protegido mide {protectedSize}; le sobran {cmText(best.spare)} cm en su lado más justo.
              {fitting.length > 1 ? ` También cabe en ${fitting.length - 1} ${fitting.length === 2 ? 'caja más' : 'cajas más'}.` : ''}
            </Muted>
            {best.box.id !== chosen && <Button icon="checkmark" label="Usar esta caja" onPress={() => onPick(best.box.id)} />}
          </View>
        ) : (
          <View style={{ gap: Spacing.two, backgroundColor: Colors.dangerSoft, borderRadius: Radius.small, padding: Spacing.three }}>
            <Text style={{ color: Colors.text, fontWeight: '700' }}>Ninguna de tus cajas le queda.</Text>
            <Muted>Protegido mide {protectedSize}.</Muted>
            {fromCatalog.length > 0 && (
              <>
                <Muted>
                  Del catálogo Kubbo le quedan: {fromCatalog.map(({ box }) => `${box.name} (${sizeLabel([box.length_mm, box.width_mm, box.height_mm])})`).join(' · ')}.
                </Muted>
                <Pressable accessibilityRole="button" onPress={() => router.push('/embalaje/catalogo')}>
                  <Text style={{ color: Colors.accent, fontWeight: '600' }}>Ver el catálogo de empaques →</Text>
                </Pressable>
              </>
            )}
            {catalog && fromCatalog.length === 0 && <Muted>Tampoco hay una en el catálogo: registra una caja a la medida en Embalaje.</Muted>}
          </View>
        ))}
    </View>
  );
}

/**
 * What to write in an online store (Mercado Libre, TikTok Shop, Amazon…) for the product shipped in its box:
 * the package's measures, the real weight (piece + box), the volumetric one and the one carriers bill.
 * Each value can be selected to copy it.
 */
export function ParcelFacts({ productGrams, box }: { productGrams: number; box: Packaging }) {
  if (!(box.length_mm > 0 && box.width_mm > 0 && box.height_mm > 0)) return null;
  const weights = parcelWeights(productGrams, box);
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Medidas del paquete', value: sizeLabel([box.length_mm, box.width_mm, box.height_mm]) },
    { label: 'Peso de la pieza', value: `${Math.round(productGrams)} g` },
    { label: `Peso de la caja${weights.estimated ? ' (estimado)' : ''}`, value: `${weights.boxGrams} g` },
    { label: 'Peso real con caja', value: kg(weights.real) },
    { label: `Peso volumétrico (÷ ${VOLUMETRIC_DIVISOR})`, value: kg(weights.volumetric) },
    { label: 'Peso que cobra la paquetería', value: kg(weights.billable), strong: true },
  ];
  return (
    <View style={{ gap: Spacing.two, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.medium, padding: Spacing.three }}>
      <Text style={{ color: Colors.text, fontWeight: '700' }}>Para tu tienda en línea</Text>
      <Muted>Lo que piden Mercado Libre, TikTok Shop y las paqueterías, sin pesar nada. Mantén presionado un dato para copiarlo.</Muted>
      {rows.map((row) => (
        <Row key={row.label} style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: Colors.textSecondary, flex: 1 }}>{row.label}</Text>
          <Text selectable style={{ color: row.strong ? Colors.accent : Colors.text, fontWeight: row.strong ? '800' : '600' }}>
            {row.value}
          </Text>
        </Row>
      ))}
      <Muted>
        {weights.volumetric > weights.real
          ? 'La caja es más grande que pesada: te cobran por volumen. Una caja más chica bajaría el envío.'
          : 'Te cobran por peso real: la caja ya es del tamaño justo.'}
        {weights.estimated ? ' El peso de la caja es un cálculo por sus medidas; si la pesas, escríbelo en Embalaje.' : ''}
      </Muted>
    </View>
  );
}
