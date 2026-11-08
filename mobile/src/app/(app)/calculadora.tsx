import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { Button, Card, Field, Heading, Line, Muted, Row, Screen, Select } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { costPerGram, filamentName, overheadPerPiece, packagingName, priceLevels, wastePct } from '@/lib/costs';
import { money, num } from '@/lib/format';
import { setQuoteDraft } from '@/lib/quote-share';
import { quickCost } from '@/lib/quotes';
import { useData } from '@/store/data';

type Use = { filament: string | null; perKg: string; grams: string };

/** What a piece costs and what to charge, without creating a product; it can become a quote. */
export default function QuickCalculatorScreen() {
  const { profile, filaments, printers, packaging } = useData();
  const levels = priceLevels(profile);
  const taxDefault = Number(profile?.quote_settings?.tax_pct ?? 16);
  const share = overheadPerPiece(profile);

  const [name, setName] = useState('');
  const [uses, setUses] = useState<Use[]>([{ filament: filaments[0]?.id ?? null, perKg: '', grams: '' }]);
  const [hours, setHours] = useState('');
  const [printerId, setPrinterId] = useState<string | null>(printers[0]?.id ?? null);
  const [waste, setWaste] = useState(String(wastePct(profile?.waste_rules, 1) || 10));
  const [post, setPost] = useState('');
  const [packagingId, setPackagingId] = useState<string | null>(null);
  const [withOverhead, setWithOverhead] = useState(share > 0);
  const [profit, setProfit] = useState(String(levels.normal));
  const [quantity, setQuantity] = useState('1');
  const [discount, setDiscount] = useState('');
  const [withTax, setWithTax] = useState(taxDefault > 0);
  const [tax, setTax] = useState(String(taxDefault || 16));

  const printer = printers.find((item) => item.id === printerId) ?? null;
  const box = packaging.find((item) => item.id === packagingId);
  const grams = uses.reduce((total, use) => total + num(use.grams), 0);
  const cost = quickCost({
    filaments: uses.map((use) => {
      const filament = filaments.find((item) => item.id === use.filament);
      return { grams: num(use.grams), costPerGram: filament ? costPerGram(filament) : num(use.perKg) / 1000 };
    }),
    minutes: num(hours) * 60,
    printer,
    kwhPrice: profile?.kwh_price ?? 0,
    wastePct: num(waste),
    post: num(post),
    packaging: box?.cost ?? 0,
    overhead: withOverhead ? share : 0,
  });
  const unit = cost.total * (1 + num(profit) / 100);
  const pieces = Math.max(1, Math.round(num(quantity)));
  const subtotal = unit * pieces;
  const off = (subtotal * num(discount)) / 100;
  const taxes = withTax ? ((subtotal - off) * num(tax)) / 100 : 0;
  const total = subtotal - off + taxes;

  const setUse = (index: number, patch: Partial<Use>) => setUses((list) => list.map((use, at) => (at === index ? { ...use, ...patch } : use)));
  const filamentOptions = filaments.map((filament) => ({ value: filament.id, label: filamentName(filament) }));

  function toQuote() {
    const materials = uses
      .filter((use) => num(use.grams) > 0)
      .map((use) => filaments.find((item) => item.id === use.filament))
      .filter((filament) => !!filament)
      .map((filament) => filamentName(filament));
    const detail = [materials.join(', '), grams ? `${Math.round(grams)} g` : '', num(hours) ? `${num(hours)} h` : ''].filter(Boolean).join(' · ');
    setQuoteDraft({
      items: [{ name: name.trim() || 'Pieza impresa en 3D', detail, quantity: pieces, unit_price: Math.round(unit * 100) / 100 }],
      discount_pct: num(discount),
      tax_pct: withTax ? num(tax) : 0,
    });
    router.push('/cotizaciones/form');
  }

  return (
    <Screen>
      <Muted>Calcula el precio de una pieza sin crear un producto. Si te lo encargan, conviértelo en cotización.</Muted>

      <Card>
        <Heading>La pieza</Heading>
        <Field label="¿Qué es? (para la cotización)" value={name} onChangeText={setName} placeholder="Llavero personalizado" />
        {uses.map((use, index) => (
          <View key={index} style={{ gap: Spacing.two }}>
            <Select
              label={index === 0 ? 'Filamento' : `Filamento ${index + 1}`}
              value={use.filament}
              onChange={(value) => setUse(index, { filament: value })}
              none="Otro (escribo el precio por kg)"
              options={filamentOptions}
            />
            <Row>
              {!use.filament && (
                <Field style={{ flex: 1 }} label="Precio por kg" unit="$" numeric value={use.perKg} onChangeText={(value) => setUse(index, { perKg: value })} placeholder="350" />
              )}
              <Field style={{ flex: 1 }} label="Gramos" unit="g" numeric value={use.grams} onChangeText={(value) => setUse(index, { grams: value })} placeholder="0" />
            </Row>
            {uses.length > 1 && (
              <Pressable accessibilityRole="button" onPress={() => setUses((list) => list.filter((_, at) => at !== index))}>
                <Text style={{ color: Colors.danger }}>Quitar este filamento</Text>
              </Pressable>
            )}
          </View>
        ))}
        <Button
          variant="secondary"
          icon="add"
          label="Otro color o material"
          onPress={() => setUses((list) => [...list, { filament: filaments[0]?.id ?? null, perKg: '', grams: '' }])}
        />
        <Field label="Horas de impresión" unit="h" numeric value={hours} onChangeText={setHours} placeholder="0" />
        <Select
          label="Impresora"
          value={printerId}
          onChange={setPrinterId}
          none="Sin impresora (no suma luz ni desgaste)"
          options={printers.map((item) => ({ value: item.id, label: item.name }))}
        />
      </Card>

      <Card>
        <Heading>Ajustes</Heading>
        <Row>
          <Field style={{ flex: 1 }} label="Posprocesado" unit="$" numeric value={post} onChangeText={setPost} placeholder="0" hint="Lijar, pintar, armar" />
          <Field style={{ flex: 1 }} label="Merma" unit="%" numeric value={waste} onChangeText={setWaste} placeholder="10" hint="Margen por fallas" />
        </Row>
        <Select
          label="Empaque"
          value={packagingId}
          onChange={setPackagingId}
          none="Sin empaque"
          options={packaging.map((item) => ({ value: item.id, label: `${packagingName(item)} · ${money(item.cost)}` }))}
        />
        <Row>
          <Field style={{ flex: 1 }} label="Ganancia" unit="%" numeric value={profit} onChangeText={setProfit} placeholder="100" />
          <Field style={{ flex: 1 }} label="Piezas" numeric value={quantity} onChangeText={setQuantity} placeholder="1" />
          <Field style={{ flex: 1 }} label="Descuento" unit="%" numeric value={discount} onChangeText={setDiscount} placeholder="0" />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ color: Colors.text, flex: 1 }}>Sumar impuestos</Text>
          {withTax && <Field style={{ width: 90 }} label="" unit="%" numeric value={tax} onChangeText={setTax} placeholder="16" />}
          <Switch value={withTax} onValueChange={setWithTax} trackColor={{ true: Colors.accent }} />
        </Row>
        {share > 0 && (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: Colors.text, flex: 1 }}>Incluir gastos fijos ({money(share)} por pieza)</Text>
            <Switch value={withOverhead} onValueChange={setWithOverhead} trackColor={{ true: Colors.accent }} />
          </Row>
        )}
      </Card>

      <Card>
        <Heading>Resultado</Heading>
        <Line label={`Filamento${num(waste) ? ` (+${num(waste)} % merma)` : ''}`} value={money(cost.filament)} />
        <Line label="Luz" value={money(cost.electricity)} />
        <Line label="Desgaste de la impresora" value={money(cost.machine)} />
        {cost.post > 0 && <Line label="Posprocesado" value={money(cost.post)} />}
        {cost.packaging > 0 && <Line label="Empaque" value={money(cost.packaging)} />}
        {cost.overhead > 0 && <Line label="Gastos fijos" value={money(cost.overhead)} />}
        <Line label="Costo por pieza" value={money(cost.total)} strong />
        <Line label={`Precio por pieza (+${num(profit)} %)`} value={money(unit)} strong />
        {pieces > 1 && <Line label={`× ${pieces} piezas`} value={money(subtotal)} />}
        {off > 0 && <Line label={`Descuento (${num(discount)} %)`} value={`−${money(off)}`} />}
        {taxes > 0 && <Line label={`Impuestos (${num(tax)} %)`} value={money(taxes)} />}
        <Row style={{ justifyContent: 'space-between', backgroundColor: Colors.accentSoft, borderRadius: Radius.medium, padding: Spacing.three }}>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '600' }}>Total</Text>
          <Text style={{ color: Colors.accent, fontSize: 24, fontWeight: '800' }}>{money(total)}</Text>
        </Row>
        <Muted>Ganas {money((unit - cost.total) * pieces - off)} antes de impuestos.</Muted>
        <Button icon="document-text" label="Crear cotización con esto" disabled={!(cost.total > 0)} onPress={toQuote} />
      </Card>
    </Screen>
  );
}
