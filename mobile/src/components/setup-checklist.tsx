import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Heading, Muted, Row } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { setupSteps } from '@/lib/setup';
import { useData } from '@/store/data';

const HIDDEN_KEY = 'kubbo3d.setupHidden';
/** Set once the welcome was seen (or skipped) on this phone. */
export const WELCOME_KEY = 'kubbo3d.welcomeSeen';

/** "Completa tu configuración": what a new workshop still needs, until it is all done (or hidden). */
export function SetupChecklist() {
  const { profile, printers, filaments, shop } = useData();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY)
      .catch(() => null)
      .then((value) => setHidden(value === '1'));
  }, []);

  const steps = setupSteps({ profile, printers, filaments });
  const done = steps.filter((step) => step.done).length;
  // Settings are the owner's; collaborators work with what is already set.
  if (hidden || done === steps.length || (shop && shop.role !== 'owner')) return null;

  const next = steps.find((step) => !step.done)!;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: Spacing.one }}>
          <Heading>Completa tu configuración</Heading>
          <Muted>
            {done} de {steps.length} listos · con estos datos tus costos salen reales.
          </Muted>
        </View>
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            setHidden(true);
            AsyncStorage.setItem(HIDDEN_KEY, '1').catch(() => {});
          }}>
          <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>Ocultar</Text>
        </Pressable>
      </Row>
      <View style={{ height: 8, borderRadius: Radius.pill, backgroundColor: Colors.surfaceRaised, overflow: 'hidden' }}>
        <View style={{ height: 8, width: `${(done / steps.length) * 100}%`, backgroundColor: Colors.accent }} />
      </View>
      {steps.map((step) => (
        <Pressable
          key={step.key}
          accessibilityRole="button"
          onPress={() => router.push(step.app as Href)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.three,
            padding: Spacing.three,
            borderRadius: Radius.medium,
            borderWidth: 1,
            borderColor: Colors.border,
            opacity: pressed ? 0.6 : 1,
          })}>
          <Ionicons name={step.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={step.done ? Colors.money : Colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600' }}>{step.title}</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{step.done ? 'Listo' : step.hint}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </Pressable>
      ))}
      <Button icon="arrow-forward" label={`Continuar: ${next.title.toLowerCase()}`} onPress={() => router.push(next.app as Href)} />
    </Card>
  );
}
