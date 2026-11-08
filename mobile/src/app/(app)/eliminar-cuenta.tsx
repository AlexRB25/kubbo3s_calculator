import { useState } from 'react';

import { Button, Card, ErrorText, Field, Heading, Muted, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useData } from '@/store/data';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://calculator.kubbo3d.com').replace(/\/$/, '');

/** Deletes the user's account and all its data (the stores require it inside the app), after typing ELIMINAR. */
export default function DeleteAccountScreen() {
  const { shop } = useData();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const owner = !shop || shop.role === 'owner';
  const ready = typed.trim().toUpperCase() === 'ELIMINAR';

  async function remove() {
    setBusy(true);
    setError('');
    const { data } = await supabase.auth.getSession();
    const response = await fetch(`${WEB_URL}/api/cuenta/eliminar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ confirm: 'ELIMINAR' }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setBusy(false);
      return setError(result?.error ?? 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.');
    }
    // Without the account the session is gone: back to the sign-in screen.
    await supabase.auth.signOut();
  }

  return (
    <Screen>
      <Card>
        <Heading>Eliminar mi cuenta</Heading>
        <Muted>
          Se borran para siempre tu cuenta y{' '}
          {owner ? 'todo tu taller: productos, inventario, ventas, gastos, cotizaciones, clientes, archivos y tu tienda' : 'tus datos'}. Tu plan se cancela y no se te
          vuelve a cobrar. Es la misma cuenta de la calculadora web y de las herramientas 3D.
        </Muted>
        <Muted>Esto no se puede deshacer.</Muted>
      </Card>
      <Field label="Escribe ELIMINAR para confirmar" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
      <ErrorText>{error}</ErrorText>
      <Button variant="danger" icon="trash" label="Eliminar para siempre" loading={busy} disabled={!ready} onPress={remove} />
    </Screen>
  );
}
