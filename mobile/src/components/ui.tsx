import { Ionicons } from '@expo/vector-icons';
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useData } from '@/store/data';

export type IconName = keyof typeof Ionicons.glyphMap;

/** Scrolling page body. Pull down to re-read everything from the server. */
export function Screen({ children }: PropsWithChildren) {
  const { reload } = useData();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.accent} />}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Heading({ children }: PropsWithChildren) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Muted({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function ErrorText({ children }: PropsWithChildren) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'money' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', icon, loading = false, disabled = false, style }: ButtonProps) {
  const inactive = disabled || loading;
  const color = variant === 'secondary' ? Colors.text : variant === 'danger' ? Colors.danger : Colors.background;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], (inactive || pressed) && styles.dimmed, style]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={color} />}
          <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  /** Unit shown after the label, e.g. "g" or "$". */
  unit?: string;
  numeric?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Field({ label, unit, numeric, hint, style, ...input }: FieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{unit ? `${label} (${unit})` : label}</Text>
      <TextInput
        placeholderTextColor={Colors.textSecondary}
        keyboardType={numeric ? 'decimal-pad' : undefined}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, input.multiline && styles.multiline]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

type Option<T extends string> = { value: T; label: string; hint?: string };

type ChipsProps<T extends string> = {
  label?: string;
  options: Option<T>[];
  /** One value, or several for a multiple choice; the caller decides what a tap does. */
  value: T | T[];
  onChange: (value: T) => void;
};

export function Chips<T extends string>({ label, options, value, onChange }: ChipsProps<T>) {
  const isSelected = (option: T) => (Array.isArray(value) ? value.includes(option) : value === option);
  return (
    <View style={styles.field}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = isSelected(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole={Array.isArray(value) ? 'checkbox' : 'radio'}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(option.value)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type SelectProps = {
  label: string;
  options: Option<string>[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Text of the "no selection" entry; omit to force a choice. */
  none?: string;
  style?: StyleProp<ViewStyle>;
};

/** Picker for long lists (products, filaments, …): opens a searchable sheet. */
export function Select({ label, options, value, onChange, placeholder = 'Elegir…', none, style }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase();
  const visible = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={styles.select}>
        <Text style={[styles.selectText, !current && { color: Colors.textSecondary }]} numberOfLines={1}>
          {current?.label ?? none ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.heading}>{label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={12} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </Row>
            {options.length > 8 && (
              <TextInput
                style={styles.input}
                placeholder="Buscar"
                placeholderTextColor={Colors.textSecondary}
                value={query}
                onChangeText={setQuery}
              />
            )}
            <ScrollView keyboardShouldPersistTaps="handled">
              {none && <SelectRow label={none} selected={value === null} onPress={() => pick(null)} />}
              {visible.map((option) => (
                <SelectRow
                  key={option.value}
                  label={option.label}
                  hint={option.hint}
                  selected={option.value === value}
                  onPress={() => pick(option.value)}
                />
              ))}
              {options.length === 0 && <Muted style={{ paddingVertical: Spacing.three }}>Todavía no hay nada que elegir.</Muted>}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function SelectRow({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={styles.selectRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.selectText}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {selected && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
    </Pressable>
  );
}

type ListItemProps = {
  title: string;
  subtitle?: string;
  /** Value shown at the right edge, with an optional line under it. */
  value?: string;
  valueHint?: string;
  tone?: 'good' | 'bad' | 'warn';
  left?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function ListItem({ title, subtitle, value, valueHint, tone, left, onPress, onLongPress }: ListItemProps) {
  const toneColor = tone === 'good' ? Colors.money : tone === 'bad' ? Colors.danger : tone === 'warn' ? Colors.gold : Colors.text;
  return (
    <Pressable
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.listItem, pressed && styles.dimmed]}>
      {left}
      <View style={{ flex: 1, gap: Spacing.half }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.hint} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <View style={{ alignItems: 'flex-end', gap: Spacing.half }}>
          <Text style={[styles.listValue, { color: toneColor }]}>{value}</Text>
          {valueHint ? <Text style={styles.hint}>{valueHint}</Text> : null}
        </View>
      ) : null}
      {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />}
    </Pressable>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.hint}>{label}</Text>
      <Text
        style={[styles.statValue, tone === 'good' && { color: Colors.money }, tone === 'bad' && { color: Colors.danger }]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** Label on the left, amount on the right: one line of a cost or sale breakdown. */
export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={strong ? styles.listTitle : styles.muted}>{label}</Text>
      <Text style={strong ? styles.listValue : styles.selectText}>{value}</Text>
    </Row>
  );
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={Colors.textSecondary} />
      <Muted style={{ textAlign: 'center' }}>{text}</Muted>
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.screen, styles.empty]}>
      <ActivityIndicator color={Colors.accent} size="large" />
    </View>
  );
}

/** Colored dot that stands for a filament. */
export function Swatch({ color }: { color: string }) {
  return <View style={[styles.swatch, { backgroundColor: color }]} />;
}

/** Asks before a destructive action. */
export function confirmDelete(message: string, onConfirm: () => void) {
  Alert.alert('¿Eliminar?', message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  heading: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  hint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 16 },
  error: {
    color: Colors.danger,
    backgroundColor: Colors.dangerSoft,
    borderRadius: Radius.small,
    padding: Spacing.three,
    fontSize: 14,
    overflow: 'hidden',
  },
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  primary: { backgroundColor: Colors.accent },
  secondary: { backgroundColor: Colors.surfaceRaised },
  money: { backgroundColor: Colors.money },
  danger: { backgroundColor: Colors.dangerSoft },
  dimmed: { opacity: 0.6 },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  field: { gap: Spacing.one },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '500' },
  input: {
    minHeight: 46,
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: Colors.text,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.background,
  },
  chipSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  chipText: { color: Colors.text, fontSize: 14, fontWeight: '500' },
  select: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
  },
  selectText: { color: Colors.text, fontSize: 15, flexShrink: 1 },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  sheet: {
    maxHeight: '80%',
    gap: Spacing.three,
    padding: Spacing.three,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  listTitle: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  listValue: { color: Colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stat: {
    flex: 1,
    minWidth: '45%',
    gap: Spacing.one,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
  statValue: { color: Colors.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
  swatch: { width: 28, height: 28, borderRadius: Radius.pill, borderColor: Colors.border, borderWidth: 1 },
});
