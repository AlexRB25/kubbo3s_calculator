import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ErrorText, ListItem, Muted, Screen, type IconName } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import CATALOG from '@/lib/tools-catalog.json';

/** The calculator's web site: it makes the one-time link that opens a tool already signed in. */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://calculator.kubbo3d.com').replace(/\/$/, '');

/** Icons of the tools, by the drawing the website gives them. */
const ICONS: Record<string, IconName> = {
  split: 'cut',
  mold: 'cube-outline',
  thermo: 'flame',
  neon: 'flash',
  tray: 'grid',
  keychain: 'key',
  magnet: 'magnet',
  cutter: 'restaurant',
  hollow: 'ellipse-outline',
  piggy: 'wallet',
  lamp: 'bulb',
  glasses: 'glasses',
  texture: 'color-filter',
  joint: 'git-merge',
  frame: 'image',
};

/** Tools that run inside the app (the catalog the tools engine was built with). */
const NATIVE = CATALOG as { slug: string; name: string; tagline: string; icon: string }[];

/** The ones that still open on the website: they need clicking or painting on the model. */
const ON_WEB: { slug: string; name: string; tagline: string; icon: IconName }[] = [
  { slug: 'llavero', name: 'Llavero', tagline: 'Llaveros con argolla', icon: 'key' },
  { slug: 'imanes', name: 'Imantador', tagline: 'Huecos para imanes', icon: 'magnet' },
  { slug: 'unir', name: 'Unidor', tagline: 'Une piezas con uniones', icon: 'git-merge' },
  { slug: 'lentes', name: 'Lentero', tagline: 'Soportes de lentes con tu personaje', icon: 'glasses' },
  { slug: '', name: 'Mis archivos', tagline: 'Lo que creaste en las herramientas web', icon: 'folder-open' },
];

/** Pages of the 3D models marketplace (on the calculator's web site). */
const MARKET: { page: string; name: string; tagline: string; icon: IconName }[] = [
  { page: '/modelos', name: 'Modelos 3D', tagline: 'Descarga o compra STL y 3MF', icon: 'storefront' },
  { page: '/modelos/panel', name: 'Vender mis modelos', tagline: 'Sube tus diseños, ventas y retiros', icon: 'cash' },
  { page: '/modelos/biblioteca', name: 'Mi biblioteca', tagline: 'Compras, descargas y favoritos', icon: 'library' },
];

/**
 * Every Kubbo3D tool, opened in a browser inside the app (they run a 3D engine in the browser), with
 * the user already signed in: the web site makes a one-time link, so the app's session is never shared.
 */
export default function ToolsScreen() {
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');

  /** A tool (its slug) or a marketplace page ("/modelos…"). */
  async function open(slug: string) {
    setError('');
    if (!WEB_URL) return setError('Falta configurar EXPO_PUBLIC_WEB_URL (la dirección de la calculadora web).');
    setOpening(slug || 'inicio');
    const target = slug.startsWith('/') ? { page: slug } : { tool: slug };
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`${WEB_URL}/api/herramientas/enlace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify(target),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.url) throw new Error(body?.error ?? 'No se pudo abrir la herramienta.');
      await WebBrowser.openBrowserAsync(body.url, {
        toolbarColor: Colors.background,
        controlsColor: Colors.accent,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch (caught) {
      setError(caught instanceof Error && caught.message !== 'Network request failed' ? caught.message : 'No se pudo conectar. Revisa tu internet.');
    } finally {
      setOpening('');
    }
  }

  return (
    <Screen>
      <Muted>Elige una foto o un archivo 3D, ajusta y guarda el STL o el 3MF. Funcionan en tu teléfono, sin internet.</Muted>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {NATIVE.map((tool) => (
        <ListItem
          key={tool.slug}
          left={<Ionicons name={ICONS[tool.icon] ?? 'construct'} size={22} color={Colors.accent} />}
          title={tool.name}
          subtitle={tool.tagline}
          onPress={() => router.push({ pathname: '/herramienta/[slug]', params: { slug: tool.slug } })}
        />
      ))}
      <Muted>Modelos 3D</Muted>
      {MARKET.map((item) => (
        <ListItem
          key={item.page}
          left={<Ionicons name={item.icon} size={22} color={Colors.accent} />}
          title={item.name}
          subtitle={item.tagline}
          onPress={opening ? undefined : () => open(item.page)}
        />
      ))}
      <Muted>En la web por ahora (necesitan tocar o pintar el modelo; llegan pronto a la app)</Muted>
      {ON_WEB.map((tool) => (
        <ListItem
          key={tool.slug || 'inicio'}
          left={<Ionicons name={tool.icon} size={22} color={Colors.accent} />}
          title={tool.name}
          subtitle={tool.tagline}
          onPress={opening ? undefined : () => open(tool.slug)}
        />
      ))}
      {opening ? <ActivityIndicator color={Colors.accent} /> : null}
    </Screen>
  );
}
