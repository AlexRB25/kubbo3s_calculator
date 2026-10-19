import { Stack } from 'expo-router';
import { type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, ErrorText, Loading } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { DataProvider, useData } from '@/store/data';
import { useSession } from '@/store/session';

/** Holds the screens back until the user's data has loaded once. */
function Gate({ children }: { children: ReactNode }) {
  const { loading, error, profile, reload } = useData();
  if (loading) return <Loading />;
  if (!profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', gap: Spacing.three, padding: Spacing.four, backgroundColor: Colors.background }}>
        <ErrorText>{error || 'Tu cuenta no tiene perfil. ¿Ya ejecutaste supabase/schema.sql en tu proyecto?'}</ErrorText>
        <Button label="Reintentar" onPress={reload} />
      </View>
    );
  }
  return children;
}

export default function AppLayout() {
  const { session } = useSession();
  if (!session) return null;

  return (
    // Keyed by user so nothing from a previous account survives a change of session.
    <DataProvider key={session.user.id} userId={session.user.id}>
      <Gate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: Colors.background },
            headerTintColor: Colors.text,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: Colors.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="producto/[id]" options={{ title: 'Producto' }} />
          <Stack.Screen name="producto/form" options={{ title: 'Producto' }} />
          <Stack.Screen name="filamento/form" options={{ title: 'Filamento' }} />
          <Stack.Screen name="filamento/compra" options={{ title: 'Comprar filamento' }} />
          <Stack.Screen name="inventario/arqueo" options={{ title: 'Arquear' }} />
          <Stack.Screen name="impresion/nueva" options={{ title: 'Mandar a imprimir' }} />
          <Stack.Screen name="impresion/[id]" options={{ title: 'Impresión' }} />
          <Stack.Screen name="venta/nueva" options={{ title: 'Registrar venta' }} />
          <Stack.Screen name="mas" options={{ title: 'Más' }} />
          <Stack.Screen name="impresoras/index" options={{ title: 'Impresoras' }} />
          <Stack.Screen name="impresoras/form" options={{ title: 'Impresora' }} />
          <Stack.Screen name="impresoras/[id]" options={{ title: 'Impresora' }} />
          <Stack.Screen name="impresoras/mantenimiento" options={{ title: 'Registrar mantenimiento' }} />
          <Stack.Screen name="proveedores/index" options={{ title: 'Proveedores' }} />
          <Stack.Screen name="proveedores/form" options={{ title: 'Proveedor' }} />
          <Stack.Screen name="gastos/index" options={{ title: 'Gastos' }} />
          <Stack.Screen name="gastos/nuevo" options={{ title: 'Registrar gasto' }} />
          <Stack.Screen name="embalaje/index" options={{ title: 'Embalaje' }} />
          <Stack.Screen name="embalaje/form" options={{ title: 'Embalaje' }} />
          <Stack.Screen name="canales/index" options={{ title: 'Canales de venta' }} />
          <Stack.Screen name="canales/form" options={{ title: 'Canal de venta' }} />
          <Stack.Screen name="ajustes" options={{ title: 'Ajustes' }} />
        </Stack>
      </Gate>
    </DataProvider>
  );
}
