import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, confirmDelete, ErrorText, Field, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useData, useSave } from '@/store/data';

export default function SupplierFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { suppliers } = useData();
  const { busy, error, setError, save } = useSave();
  const supplier = suppliers.find((item) => item.id === id);

  const [name, setName] = useState(supplier?.name ?? '');
  const [contact, setContact] = useState(supplier?.contact ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [url, setUrl] = useState(supplier?.url ?? '');
  const [notes, setNotes] = useState(supplier?.notes ?? '');

  function submit() {
    if (!name.trim()) return setError('Ponle nombre al proveedor.');
    const row = { name: name.trim(), contact: contact.trim(), phone: phone.trim(), url: url.trim(), notes: notes.trim() };
    save(() => (supplier ? supabase.from('suppliers').update(row).eq('id', supplier.id) : supabase.from('suppliers').insert(row)));
  }

  return (
    <Screen>
      <Field label="Nombre" value={name} onChangeText={setName} maxLength={60} />
      <Field label="Contacto" value={contact} onChangeText={setContact} placeholder="Persona o correo" maxLength={80} />
      <Field label="Teléfono o WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} />
      <Field label="Tienda o sitio web" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" maxLength={200} />
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline maxLength={300} placeholder="Tiempos de entrega, descuentos…" />

      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" onPress={submit} loading={busy} />
      {supplier && (
        <Button
          variant="danger"
          icon="trash"
          label="Eliminar proveedor"
          disabled={busy}
          onPress={() =>
            confirmDelete(`Se eliminará "${supplier.name}". Tus compras y gastos se conservan sin proveedor.`, () =>
              save(() => supabase.from('suppliers').delete().eq('id', supplier.id)),
            )
          }
        />
      )}
    </Screen>
  );
}
