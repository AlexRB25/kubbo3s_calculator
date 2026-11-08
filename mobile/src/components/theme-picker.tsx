import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { Colors, paletteOf, Radius, Spacing, THEMES, type ThemeName } from '@/constants/theme';
import { useTheme } from '@/store/theme';

/**
 * The themes as small previews (their background, surface and accent). A tap applies one, which draws the
 * whole app again; with `value`/`onChange` it only marks the choice (the welcome applies it at the end).
 */
export function ThemePicker({ value, onChange }: { value?: ThemeName; onChange?: (name: ThemeName) => void }) {
  const current = useTheme();
  const theme = value ?? current.theme;
  const setTheme = onChange ?? current.setTheme;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
      {THEMES.map((item) => {
        const palette = paletteOf(item.name);
        const selected = item.name === theme;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
            onPress={() => setTheme(item.name)}
            style={{
              width: '48%',
              flexGrow: 1,
              borderRadius: Radius.medium,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? Colors.accent : Colors.border,
              backgroundColor: Colors.surface,
              padding: Spacing.two,
              gap: Spacing.two,
            }}>
            <View style={{ backgroundColor: palette.background, borderRadius: Radius.small, padding: Spacing.two, gap: Spacing.two, borderWidth: 1, borderColor: palette.border }}>
              <View style={{ height: 8, width: '70%', borderRadius: 4, backgroundColor: palette.accent }} />
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: palette.surfaceRaised }} />
                <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: palette.accent }} />
                <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: palette.text }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: Colors.text, fontWeight: '700' }}>{item.label}</Text>
              {selected && <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />}
            </View>
            <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{item.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
