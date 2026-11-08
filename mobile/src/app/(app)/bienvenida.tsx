import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WELCOME_KEY } from '@/components/setup-checklist';
import { ThemePicker } from '@/components/theme-picker';
import { Button, type IconName } from '@/components/ui';
import { Colors, Radius, Spacing, type ThemeName } from '@/constants/theme';
import { useTheme } from '@/store/theme';

const SLIDES: { icon: IconName; title: string; text: string; points: string[] }[] = [
  {
    icon: 'calculator',
    title: 'Calcula lo que de verdad te cuesta cada pieza',
    text: 'Filamento, luz, desgaste de la impresora, posprocesado y merma: Kubbo3D los suma y te dice a cuánto venderla.',
    points: ['Cálculo rápido sin crear producto', 'Precio por canal con sus comisiones', 'Varios colores y materiales por pieza'],
  },
  {
    icon: 'document-text',
    title: 'Cotiza y manda el PDF en un minuto',
    text: 'Convierte el cálculo en una cotización con tu logo, folio, vigencia y condiciones de pago.',
    points: ['PDF listo para WhatsApp o correo', 'Estado: en espera, aceptada o rechazada', 'Descuentos, impuestos y envío'],
  },
  {
    icon: 'stats-chart',
    title: 'Lleva el control de tu taller',
    text: 'Inventario de filamento, impresiones, ventas, gastos y mantenimiento de tus impresoras en un solo lugar.',
    points: ['Avisos de filamento bajo', 'Ganancia y flujo de caja del mes', 'La misma cuenta en la app y en la web'],
  },
];

/** First screen after signing up: what Kubbo3D does, and the theme to use. Shown once per phone. */
export default function WelcomeScreen() {
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<ThemeName>(theme);
  const last = step === SLIDES.length;

  function finish() {
    AsyncStorage.setItem(WELCOME_KEY, '1').catch(() => {});
    router.back();
    // Applying another theme draws the app again, so it goes last.
    if (chosen !== theme) setTimeout(() => setTheme(chosen), 50);
  }

  const slide = SLIDES[step];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.three }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[...SLIDES, null].map((_, index) => (
            <View
              key={index}
              style={{ height: 8, width: index === step ? 28 : 8, borderRadius: 4, backgroundColor: index === step ? Colors.accent : Colors.border }}
            />
          ))}
        </View>
        {!last && (
          <Pressable accessibilityRole="button" hitSlop={12} onPress={finish}>
            <Text style={{ color: Colors.accent, fontWeight: '600', fontSize: 15 }}>Omitir</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.four, flexGrow: 1 }}>
        {last ? (
          <>
            <Ionicons name="color-palette" size={40} color={Colors.accent} />
            <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '800' }}>Elige tu tema</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 16, lineHeight: 22 }}>
              Escoge cómo se ve la app. Puedes cambiarlo cuando quieras en Ajustes.
            </Text>
            <ThemePicker value={chosen} onChange={setChosen} />
          </>
        ) : (
          <>
            <View style={{ width: 72, height: 72, borderRadius: Radius.large, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={slide.icon} size={38} color={Colors.accent} />
            </View>
            <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '800', lineHeight: 34 }}>{slide.title}</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 16, lineHeight: 22 }}>{slide.text}</Text>
            <View style={{ gap: Spacing.two, backgroundColor: Colors.surface, borderRadius: Radius.medium, borderWidth: 1, borderColor: Colors.border, padding: Spacing.three }}>
              {slide.points.map((point) => (
                <View key={point} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.money} />
                  <Text style={{ color: Colors.text, fontSize: 15, flex: 1 }}>{point}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ padding: Spacing.three, gap: Spacing.two }}>
        <Button icon={last ? 'checkmark' : 'arrow-forward'} label={last ? 'Empezar' : 'Continuar'} onPress={() => (last ? finish() : setStep(step + 1))} />
        {step > 0 && <Button variant="secondary" label="Atrás" onPress={() => setStep(step - 1)} />}
      </View>
    </SafeAreaView>
  );
}
