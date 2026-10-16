import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.PB_SUPABASE_URL;
const key = process.env.PB_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

let browser: SupabaseClient | undefined;

/** Client for the browser: carries the signed-in user's session, so RLS shows only their rows. */
export function supabase(): SupabaseClient {
  return (browser ??= createBrowserClient(url || "https://sin-configurar.supabase.co", key || "sin-configurar", {
    // With a shared parent domain (e.g. ".kubbo3d.com") one sign-in works on every Kubbo3D site.
    cookieOptions: process.env.PB_COOKIE_DOMAIN ? { domain: process.env.PB_COOKIE_DOMAIN } : undefined,
  }));
}

/** Sessionless client for Server Components: reads only what the store publishes to everyone. */
export function publicClient(): SupabaseClient {
  return createClient(url || "https://sin-configurar.supabase.co", key || "sin-configurar", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Public URL of a workshop product photo (bucket `products`, same one the mobile app uses). */
export function imageUrl(path: string | null) {
  return path ? `${url}/storage/v1/object/public/products/${path}` : null;
}

/** Uploads a photo to the user's folder of the `products` bucket and returns its path. */
export async function uploadProductImage(userId: string, file: File) {
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase().storage.from("products").upload(path, file, { contentType: file.type });
  return { path, error };
}

/** Supabase auth error codes → message for the user (same wording as the mobile app). */
export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "user_already_exists":
    case "email_exists":
      return "Ya existe una cuenta con ese correo.";
    case "weak_password":
      return "La contraseña es demasiado débil. Usa al menos 8 caracteres.";
    case "email_not_confirmed":
      return "Confirma tu correo con el enlace que te enviamos antes de entrar.";
    case "validation_failed":
      return "Revisa el correo y la contraseña.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Demasiados intentos. Espera un momento y vuelve a probar.";
    case "signup_disabled":
      return "El registro de cuentas nuevas está desactivado.";
    case "email_address_invalid":
      return "Ese correo no parece válido.";
    case "email_address_not_authorized":
      return "El servidor de correo todavía no puede enviar mensajes a esa dirección.";
    default:
      // "Database error saving new user" is the signup trigger of schema.sql failing (or the schema not applied).
      if (/database error/i.test(error.message)) {
        return "No se pudo crear tu perfil en la base de datos. Avísanos para revisarlo.";
      }
      if (/fetch|network/i.test(error.message)) return "No se pudo conectar con el servidor. Revisa tu conexión.";
      // Unknown errors show Supabase's own text: a vague message here hides what has to be fixed.
      return `Algo salió mal: ${error.message}`;
  }
}
