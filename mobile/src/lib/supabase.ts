import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Only the publishable key ships in the app. The secret key lives in the dashboard server.
export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'https://sin-configurar.supabase.co', key || 'sin-configurar', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Public URL of a product image stored in the `products` bucket. */
export function imageUrl(path: string | null) {
  return path ? `${url}/storage/v1/object/public/products/${path}` : null;
}

/** Uploads a picked photo to the user's folder of the `products` bucket and returns its path. */
export async function uploadProductImage(userId: string, uri: string, mimeType = 'image/jpeg') {
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('products').upload(path, body, { contentType: mimeType });
  return { path, error };
}

/** Supabase auth error codes → message for the user. */
export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya existe una cuenta con ese correo.';
    case 'weak_password':
      return 'La contraseña es demasiado débil. Usa al menos 8 caracteres.';
    case 'email_not_confirmed':
      return 'Confirma tu correo con el enlace que te enviamos antes de entrar.';
    case 'validation_failed':
      return 'Revisa el correo y la contraseña.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Demasiados intentos. Espera un momento y vuelve a probar.';
    default:
      return 'Algo salió mal. Inténtalo de nuevo.';
  }
}
