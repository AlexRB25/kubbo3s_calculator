import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { Button, ListItem, Muted, Screen, type IconName } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useData } from '@/store/data';

export default function MoreScreen() {
  const { profile, printers, suppliers, expenses, channels, packaging } = useData();

  const links: { href: Href; icon: IconName; title: string; subtitle: string }[] = [
    { href: '/impresoras', icon: 'print', title: 'Impresoras', subtitle: `${printers.length} · mantenimientos y ajustes` },
    { href: '/proveedores', icon: 'business', title: 'Proveedores', subtitle: `${suppliers.length} registrados` },
    { href: '/embalaje', icon: 'cube', title: 'Embalaje', subtitle: `${packaging.length} cajas, sobres y bolsas` },
    { href: '/gastos', icon: 'receipt', title: 'Gastos', subtitle: `${expenses.length} registrados` },
    { href: '/canales', icon: 'storefront', title: 'Canales de venta', subtitle: channels.map((channel) => channel.name).join(', ') },
    { href: '/ajustes', icon: 'settings', title: 'Ajustes', subtitle: 'Negocio, precio de la luz y ganancia deseada' },
  ];

  return (
    <Screen>
      {links.map((link) => (
        <ListItem
          key={link.title}
          left={<Ionicons name={link.icon} size={22} color={Colors.accent} />}
          title={link.title}
          subtitle={link.subtitle}
          onPress={() => router.push(link.href)}
        />
      ))}
      <Muted style={{ textAlign: 'center' }}>{profile?.email}</Muted>
      <Button variant="secondary" icon="log-out" label="Cerrar sesión" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
