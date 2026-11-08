import type { Filament, Printer, Profile } from './types';

// Same file in web/src/lib and mobile/src/lib: keep them identical.

export type SetupStep = {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  /** Where it is done on the web and in the app. */
  web: string;
  app: string;
};

/** What a new workshop needs before its costs are real; the first one missing is the next to do. */
export function setupSteps({ profile, printers, filaments }: { profile: Profile | null; printers: Printer[]; filaments: Filament[] }): SetupStep[] {
  return [
    {
      key: 'business',
      title: 'Datos del negocio',
      hint: 'El nombre de tu taller y tu moneda',
      done: !!profile?.business_name?.trim(),
      web: '/app/ajustes',
      app: '/ajustes',
    },
    {
      key: 'printers',
      title: 'Tus impresoras',
      hint: 'Su consumo de luz y su desgaste por hora',
      done: printers.length > 0,
      web: '/app/impresoras',
      app: '/impresoras/form',
    },
    {
      key: 'filaments',
      title: 'Tus filamentos',
      hint: 'Lo que pagas por kilo de cada uno',
      done: filaments.length > 0,
      web: '/app/filamento',
      app: '/filamento/form',
    },
    {
      key: 'costs',
      title: 'Luz y gastos fijos',
      hint: 'El precio del kWh de tu recibo y lo que pagas cada mes',
      done: Number(profile?.kwh_price) > 0,
      web: '/app/ajustes',
      app: '/ajustes',
    },
    {
      key: 'quotes',
      title: 'Datos de tus cotizaciones',
      hint: 'Logo, teléfono y condiciones de pago para el PDF',
      done: !!(profile?.quote_settings?.phone || profile?.quote_settings?.logo_path),
      web: '/app/ajustes',
      app: '/cotizaciones/datos',
    },
  ];
}
