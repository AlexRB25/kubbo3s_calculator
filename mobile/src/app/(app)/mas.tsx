import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { Button, ListItem, Muted, Screen, type IconName } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { ShopRole } from '@/lib/types';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';

const ROLE_NAMES: Record<ShopRole, string> = { owner: 'Dueño', admin: 'Administrador', staff: 'Colaborador' };

export default function MoreScreen() {
  const { printers, suppliers, expenses, channels, packaging, shop, reload } = useData();
  const { session } = useSession();
  const role = shop?.role ?? 'owner';
  const userId = session?.user.id;

  // Staff do the daily work; channels and suppliers are for the owner and admins, settings only for the owner.
  const links: { href: Href; icon: IconName; title: string; subtitle: string; roles?: ShopRole[] }[] = [
    { href: '/impresoras', icon: 'print', title: 'Impresoras', subtitle: `${printers.length} · mantenimientos y ajustes` },
    { href: '/proveedores', icon: 'business', title: 'Proveedores', subtitle: `${suppliers.length} registrados`, roles: ['owner', 'admin'] },
    { href: '/embalaje', icon: 'cube', title: 'Embalaje', subtitle: `${packaging.length} cajas, sobres y bolsas` },
    { href: '/gastos', icon: 'receipt', title: 'Gastos', subtitle: `${expenses.length} registrados` },
    { href: '/canales', icon: 'storefront', title: 'Canales de venta', subtitle: channels.map((channel) => channel.name).join(', '), roles: ['owner', 'admin'] },
    { href: '/ajustes', icon: 'settings', title: 'Ajustes', subtitle: 'Negocio, precio de la luz y ganancia deseada', roles: ['owner'] },
  ];

  async function switchTo(ownerId: string) {
    if (!userId) return;
    await supabase.from('profiles').update({ active_shop: ownerId === userId ? null : ownerId }).eq('id', userId);
    await reload();
  }

  return (
    <Screen>
      {shop && shop.shops.length > 1 && (
        <>
          <Muted>Tienda en la que trabajas</Muted>
          {shop.shops.map((item) => (
            <ListItem
              key={item.owner_id}
              left={<Ionicons name={item.owner_id === shop.shop_id ? 'radio-button-on' : 'radio-button-off'} size={22} color={Colors.accent} />}
              title={item.name}
              subtitle={ROLE_NAMES[item.role]}
              onPress={item.owner_id === shop.shop_id ? undefined : () => switchTo(item.owner_id)}
            />
          ))}
        </>
      )}
      {links
        .filter((link) => !link.roles || link.roles.includes(role))
        .map((link) => (
          <ListItem
            key={link.title}
            left={<Ionicons name={link.icon} size={22} color={Colors.accent} />}
            title={link.title}
            subtitle={link.subtitle}
            onPress={() => router.push(link.href)}
          />
        ))}
      <Muted style={{ textAlign: 'center' }}>
        {session?.user.email}
        {role !== 'owner' ? ` · ${ROLE_NAMES[role]}` : ''}
      </Muted>
      <Muted style={{ textAlign: 'center' }}>Para invitar a tu equipo entra a la calculadora web → Equipo.</Muted>
      <Button variant="secondary" icon="log-out" label="Cerrar sesión" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
