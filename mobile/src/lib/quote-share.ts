import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';

import { quoteFolio, quoteHtml, quoteMessage, type QuoteBusiness, type QuoteDraft } from './quotes';
import { supabase } from './supabase';
import type { Profile, Quote } from './types';

/** Public address of a file in the products bucket (logos and product photos). */
export const publicFile = (path?: string | null) => (path ? supabase.storage.from('products').getPublicUrl(path).data.publicUrl : null);

/** Name, contact and logo of the workshop for its quotes. */
export function quoteBusiness(profile: Profile | null): QuoteBusiness {
  const settings = profile?.quote_settings ?? {};
  return { name: profile?.business_name || profile?.name || '', settings, logoUrl: publicFile(settings.logo_path) };
}

/** Turns the quote into a PDF and opens the share sheet (WhatsApp, correo, Drive…). */
export async function shareQuotePdf(quote: Quote, profile: Profile | null) {
  try {
    const { uri } = await Print.printToFileAsync({ html: quoteHtml(quote, quoteBusiness(profile)) });
    if (!(await Sharing.isAvailableAsync())) return Alert.alert('No se puede compartir', 'Este teléfono no permite compartir archivos.');
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Cotización ${quoteFolio(quote)}` });
  } catch (error) {
    Alert.alert('No se pudo crear el PDF', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
  }
}

/** Opens WhatsApp with the client's number and a summary of the quote. */
export function sendQuoteWhatsApp(quote: Quote, profile: Profile | null) {
  const phone = quote.client_phone.replace(/\D/g, '');
  const text = encodeURIComponent(quoteMessage(quote, quoteBusiness(profile).name));
  Linking.openURL(`https://wa.me/${phone}?text=${text}`).catch(() => Alert.alert('No se pudo abrir WhatsApp'));
}

/** A quote the quick calculator starts; the quote form takes it once. */
let pendingDraft: QuoteDraft | null = null;
export const setQuoteDraft = (draft: QuoteDraft) => {
  pendingDraft = draft;
};
export const takeQuoteDraft = () => {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
};
