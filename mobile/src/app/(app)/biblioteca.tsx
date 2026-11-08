import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Chips, Heading, Muted, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { GUIDES, MATERIALS, type Guide } from '@/lib/guides';

const CATEGORIES = ['Todas', ...new Set(GUIDES.map((guide) => guide.category))];

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={{ gap: Spacing.one }}>
      <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{title}</Text>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', gap: Spacing.two }}>
          <Text style={{ color: Colors.accent }}>•</Text>
          <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 20, flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', gap: Spacing.two }}>
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Text style={{ color: Colors.accent, fontSize: 12, fontWeight: '700' }}>{guide.category}</Text>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '700' }}>{guide.title}</Text>
          <Muted>{guide.summary}</Muted>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
      </Pressable>
      {open && (
        <View style={{ gap: Spacing.three, borderTopColor: Colors.border, borderTopWidth: 1, paddingTop: Spacing.three }}>
          <Bullets title="Cuándo hacerla" items={guide.when} />
          <Bullets title="Cómo hacerla" items={guide.steps} />
          <Bullets title="Cómo leer el resultado" items={guide.read} />
          {guide.tip ? (
            <Text style={{ color: Colors.text, backgroundColor: Colors.accentSoft, borderRadius: Radius.small, padding: Spacing.three, overflow: 'hidden' }}>
              💡 {guide.tip}
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

/** Calibration tests and starting values per material. */
export default function LibraryScreen() {
  const [category, setCategory] = useState('Todas');
  const shown = category === 'Todas' ? GUIDES : GUIDES.filter((guide) => guide.category === category);
  return (
    <Screen>
      <Muted>Pruebas de calibración para sacarle la mejor calidad a tu impresora y a cada filamento. Toca una para ver cómo hacerla.</Muted>
      <Chips options={CATEGORIES.map((value) => ({ value, label: value }))} value={category} onChange={setCategory} />
      {shown.map((guide) => (
        <GuideCard key={guide.id} guide={guide} />
      ))}
      <Heading>Valores de inicio por material</Heading>
      <Muted>Lo que diga el carrete de tu marca va primero; la torre de temperatura decide.</Muted>
      {MATERIALS.map((item) => (
        <Card key={item.material} style={{ gap: Spacing.two }}>
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '700' }}>{item.material}</Text>
          <Muted>
            Boquilla {item.nozzle} · Cama {item.bed} · Ventilador {item.fan}
          </Muted>
          <Muted>Secado: {item.dry}</Muted>
          <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 20 }}>{item.notes}</Text>
        </Card>
      ))}
    </Screen>
  );
}
