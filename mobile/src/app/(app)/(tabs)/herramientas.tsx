import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ErrorText, ListItem, Muted, Screen, type IconName } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/** The calculator's web site: it makes the one-time link that opens a tool already signed in. */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://calculator.kubbo3d.com').replace(/\/$/, '');

/** The tools of the tools site (same slugs as its pages). */
const TOOLS: { slug: string; name: string; tagline: string; icon: IconName }[] = [
  { slug: 'partir', name: 'Partidor', tagline: 'Parte en piezas que quepan en tu impresora', icon: 'cut' },
  { slug: 'moldes', name: 'Moldero', tagline: 'Genera moldes', icon: 'cube-outline' },
  { slug: 'termoformado', name: 'Termoformador', tagline: 'Moldes y lámina para termoformar', icon: 'flame' },
  { slug: 'neon', name: 'Neón', tagline: 'Guías para neón LED', icon: 'flash' },
  { slug: 'gomitas', name: 'Gomitero', tagline: 'Moldes de relleno', icon: 'grid' },
  { slug: 'llavero', name: 'Llavero', tagline: 'Llaveros con argolla', icon: 'key' },
  { slug: 'imanes', name: 'Imantador', tagline: 'Huecos para imanes', icon: 'magnet' },
  { slug: 'galletas', name: 'Galletero', tagline: 'Cortadores de galletas', icon: 'restaurant' },
  { slug: 'hueco', name: 'Huequito', tagline: 'Piezas huecas', icon: 'ellipse-outline' },
  { slug: 'alcancia', name: 'Alcancía', tagline: 'Alcancías', icon: 'wallet' },
  { slug: 'lampara', name: 'Lámpara', tagline: 'Lámparas', icon: 'bulb' },
  { slug: 'lentes', name: 'Lentero', tagline: 'Soportes de lentes con tu personaje', icon: 'glasses' },
  { slug: '', name: 'Mis archivos y todas las herramientas', tagline: 'La página principal de herramientas', icon: 'apps' },
];

/**
 * Every Kubbo3D tool, opened in a browser inside the app (they run a 3D engine in the browser), with
 * the user already signed in: the web site makes a one-time link, so the app's session is never shared.
 */
export default function ToolsScreen() {
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');

  async function open(slug: string) {
    setError('');
    if (!WEB_URL) return setError('Falta configurar EXPO_PUBLIC_WEB_URL (la dirección de la calculadora web).');
    setOpening(slug || 'inicio');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`${WEB_URL}/api/herramientas/enlace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ tool: slug }),
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
      <Muted>
        Se abren aquí mismo con tu cuenta. Sube tu modelo, ajusta y descarga el STL o el 3MF; también queda en Mis archivos para volver a bajarlo.
      </Muted>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {TOOLS.map((tool) => (
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
