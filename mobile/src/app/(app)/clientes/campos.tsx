import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';

import { Button, Card, ErrorText, Field, Heading, Muted, Row, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { addField, suggestedFields, taxLabel } from '@/lib/clients';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

/** The name of the tax id and the client fields the workshop needs for its invoices. */
export default function ClientFieldsScreen() {
  const { profile } = useData();
  const { busy, error, save } = useSave();
  const settings = profile?.client_fields ?? {};
  const currency = profile?.currency ?? 'MXN';
  const [label, setLabel] = useState(settings.tax_label ?? '');
  const [fields, setFields] = useState(settings.fields ?? []);
  const [adding, setAdding] = useState('');
  const missing = suggestedFields(currency).filter((name) => !fields.some((field) => field.label.toLowerCase() === name.toLowerCase()));

  return (
    <Screen>
      <Muted>Cada país pide datos distintos para facturar. Da de alta los que necesites y marca cuáles salen en el PDF de tus cotizaciones.</Muted>
      <Field
        label="¿Cómo se llama el ID fiscal en tu país?"
        value={label}
        onChangeText={setLabel}
        placeholder={taxLabel({}, currency)}
        hint={`Vacío = ${taxLabel({}, currency)}`}
      />
      <Card>
        <Heading>Campos propios</Heading>
        {fields.length === 0 && <Muted>Sin campos extra. Agrega los que pidan tus facturas.</Muted>}
        {fields.map((field, index) => (
          <View key={field.id} style={{ gap: Spacing.two, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.medium, padding: Spacing.two }}>
            <Row>
              <TextInput
                value={field.label}
                onChangeText={(text) => setFields(fields.map((item, at) => (at === index ? { ...item, label: text } : item)))}
                style={{ flex: 1, color: Colors.text, fontSize: 15, paddingVertical: Spacing.one }}
                accessibilityLabel="Nombre del campo"
              />
              <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${field.label}`} hitSlop={12} onPress={() => setFields(fields.filter((_, at) => at !== index))}>
                <Ionicons name="trash-outline" size={20} color={Colors.danger} />
              </Pressable>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>Sale en el PDF de la cotización</Text>
              <Switch
                value={field.on_quote}
                onValueChange={(on) => setFields(fields.map((item, at) => (at === index ? { ...item, on_quote: on } : item)))}
                trackColor={{ true: Colors.accent }}
              />
            </Row>
          </View>
        ))}
        <Row>
          <Field style={{ flex: 1 }} label="Nuevo campo" value={adding} onChangeText={setAdding} placeholder="p. ej. Régimen fiscal" />
        </Row>
        <Button
          variant="secondary"
          icon="add"
          label="Agregar campo"
          disabled={!adding.trim()}
          onPress={() => {
            setFields(addField(fields, adding));
            setAdding('');
          }}
        />
        {missing.length > 0 && (
          <>
            <Muted>Sugeridos para tu país:</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
              {missing.map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => setFields(addField(fields, name))}
                  style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two }}>
                  <Text style={{ color: Colors.text }}>+ {name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </Card>
      <ErrorText>{error}</ErrorText>
      <Button
        label="Guardar campos"
        loading={busy}
        onPress={() =>
          save(() =>
            supabase
              .from('profiles')
              .update({ client_fields: { tax_label: label.trim(), fields: fields.filter((field) => field.label.trim()).map((field) => ({ ...field, label: field.label.trim() })) } })
              .eq('id', profile!.id),
          )
        }
      />
    </Screen>
  );
}
