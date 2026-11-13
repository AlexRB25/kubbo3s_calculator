import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import { Button, ErrorText, Field, Muted, Row, Screen, Select } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { field, getWorkshopCurrency, num } from '@/lib/format';
import { DIAL_CODES, defaultDialCode, joinPhone, splitPhone } from '@/lib/phone';
import { publicFile } from '@/lib/quote-share';
import { supabase, uploadProductImage } from '@/lib/supabase';
import type { QuoteSettings } from '@/lib/types';
import { useData, useSave } from '@/store/data';

/** The workshop's details on its quotes (contact, logo) and what each new quote proposes. */
export default function QuoteSettingsScreen() {
  const { profile, shop } = useData();
  const { busy, error, setError, save } = useSave();
  const settings: QuoteSettings = profile?.quote_settings ?? {};

  // The phone is saved with its country code: "+52 3312345678".
  const [savedPhone] = useState(() => splitPhone(settings.phone ?? '', defaultDialCode(getWorkshopCurrency())));
  const [dialCode, setDialCode] = useState(savedPhone.code);
  const [phone, setPhone] = useState(savedPhone.number);
  const [email, setEmail] = useState(settings.email ?? '');
  const [address, setAddress] = useState(settings.address ?? '');
  const [tax, setTax] = useState(field(settings.tax_pct ?? 16));
  const [validity, setValidity] = useState(field(settings.validity_days ?? 15));
  const [payment, setPayment] = useState(settings.payment_terms ?? '');
  const [delivery, setDelivery] = useState(settings.delivery ?? '');
  const [notes, setNotes] = useState(settings.notes ?? '');
  const [logo, setLogo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const shownLogo = logo?.uri ?? (removeLogo ? null : publicFile(settings.logo_path));

  async function pickLogo() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) {
      setLogo(result.assets[0]);
      setRemoveLogo(false);
    }
  }

  function submit() {
    if (!profile || !shop) return setError('Todavía no carga tu taller.');
    const old = settings.logo_path;
    save(async () => {
      let logoPath = removeLogo ? '' : (settings.logo_path ?? '');
      if (logo) {
        const upload = await uploadProductImage(shop.shop_id, logo.uri, logo.mimeType);
        if (upload.error) return { error: { message: `No se pudo subir el logo: ${upload.error.message}` } };
        logoPath = upload.path;
      }
      const next: QuoteSettings = {
        ...settings,
        phone: joinPhone(dialCode, phone),
        email: email.trim(),
        address: address.trim(),
        tax_pct: num(tax),
        validity_days: Math.round(num(validity)),
        payment_terms: payment.trim(),
        delivery: delivery.trim(),
        notes: notes.trim(),
        logo_path: logoPath,
      };
      const result = await supabase.from('profiles').update({ quote_settings: next }).eq('id', profile.id);
      // The replaced logo is no longer used anywhere.
      if (!result.error && old && old !== logoPath) supabase.storage.from('products').remove([old]);
      return result;
    });
  }

  return (
    <Screen>
      <Muted>Estos datos salen en el PDF que mandas a tus clientes. El nombre del negocio se cambia en Ajustes.</Muted>
      <Row>
        {shownLogo ? (
          <Image source={{ uri: shownLogo }} style={{ width: 72, height: 72, borderRadius: Radius.medium, backgroundColor: Colors.surfaceRaised }} contentFit="contain" />
        ) : null}
        <Button style={{ flex: 1 }} variant="secondary" icon="image" label={shownLogo ? 'Cambiar logo' : 'Subir logo'} onPress={pickLogo} />
        {shownLogo ? (
          <Button
            variant="danger"
            icon="trash"
            label=""
            onPress={() => {
              setLogo(null);
              setRemoveLogo(true);
            }}
          />
        ) : null}
      </Row>
      <Row>
        <Select
          style={{ width: 140 }}
          label="Lada"
          options={[...(DIAL_CODES.some((item) => item.code === dialCode) ? [] : [{ value: dialCode, label: dialCode }]), ...DIAL_CODES.map((item) => ({ value: item.code, label: item.label }))]}
          value={dialCode}
          onChange={(value) => value && setDialCode(value)}
        />
        <Field style={{ flex: 1 }} label="Teléfono o WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="33 1234 5678" />
      </Row>
      <Field label="Correo de contacto" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Dirección" value={address} onChangeText={setAddress} placeholder="Calle, colonia, ciudad" />
      <Row>
        <Field style={{ flex: 1 }} label="Impuesto" unit="%" numeric value={tax} onChangeText={setTax} hint="16 = IVA; 0 si no facturas" />
        <Field style={{ flex: 1 }} label="Vigencia" unit="días" numeric value={validity} onChangeText={setValidity} />
      </Row>
      <Field label="Condiciones de pago" value={payment} onChangeText={setPayment} multiline placeholder="50 % de anticipo y el resto al entregar" />
      <Field label="Entrega" value={delivery} onChangeText={setDelivery} multiline placeholder="5 días hábiles después del anticipo" />
      <Field label="Notas" value={notes} onChangeText={setNotes} multiline placeholder="Los precios pueden cambiar si cambian medidas, material o colores." />
      <ErrorText>{error}</ErrorText>
      <Button label="Guardar" loading={busy} onPress={submit} />
    </Screen>
  );
}
