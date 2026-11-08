/** The colours of a theme. Screens read them from `Colors`, which always holds the active theme. */
export type Palette = {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentSoft: string;
  money: string;
  moneySoft: string;
  gold: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
};

const DARK: Palette = {
  background: '#101315',
  surface: '#181C1F',
  surfaceRaised: '#22282C',
  border: '#2E363B',
  text: '#FFFFFF',
  textSecondary: '#9AA7AD',
  // Brand teal, brightened so it reads on the dark surfaces; labels on top of it use the background color.
  accent: '#35C5D6',
  accentSoft: 'rgba(53, 197, 214, 0.16)',
  money: '#34D399',
  moneySoft: 'rgba(52, 211, 153, 0.16)',
  gold: '#F5B83D',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.15)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type ThemeName = 'oscuro' | 'claro' | 'verde' | 'azul';

const PALETTES: Record<ThemeName, Palette> = {
  oscuro: DARK,
  claro: {
    background: '#F4F6F8',
    surface: '#FFFFFF',
    surfaceRaised: '#E9EEF1',
    border: '#D5DDE2',
    text: '#111827',
    textSecondary: '#5B6770',
    // Deeper teal so it reads on white; labels on it use the (light) background colour.
    accent: '#0B7F8D',
    accentSoft: 'rgba(11, 127, 141, 0.12)',
    money: '#047857',
    moneySoft: 'rgba(4, 120, 87, 0.12)',
    gold: '#B45309',
    danger: '#DC2626',
    dangerSoft: 'rgba(220, 38, 38, 0.1)',
    overlay: 'rgba(17, 24, 39, 0.45)',
  },
  verde: {
    ...DARK,
    background: '#0E1311',
    surface: '#151C19',
    surfaceRaised: '#1E2823',
    border: '#2A3731',
    textSecondary: '#9BABA3',
    accent: '#3DDC84',
    accentSoft: 'rgba(61, 220, 132, 0.16)',
  },
  azul: {
    ...DARK,
    background: '#0D111C',
    surface: '#141A29',
    surfaceRaised: '#1D2437',
    border: '#29324B',
    textSecondary: '#9DA6BD',
    accent: '#5B9BFF',
    accentSoft: 'rgba(91, 155, 255, 0.18)',
  },
};

/** The themes a user can pick, as shown in Ajustes and the welcome. */
export const THEMES: { name: ThemeName; label: string; hint: string }[] = [
  { name: 'oscuro', label: 'Oscuro', hint: 'El de siempre, con turquesa Kubbo' },
  { name: 'claro', label: 'Claro', hint: 'Fondo blanco, para leer bajo el sol' },
  { name: 'verde', label: 'Oscuro verde', hint: 'Oscuro con acento verde' },
  { name: 'azul', label: 'Oscuro azul', hint: 'Oscuro con azul eléctrico' },
];

export const paletteOf = (name: ThemeName) => PALETTES[name];
export const isThemeName = (value: unknown): value is ThemeName => typeof value === 'string' && value in PALETTES;

/** The active theme's colours. Changed in place by applyTheme; screens re-render after it. */
export const Colors: Palette = { ...DARK };

let version = 0;
let active: ThemeName = 'oscuro';
export const activeTheme = () => active;

export function applyTheme(name: ThemeName) {
  Object.assign(Colors, PALETTES[name]);
  active = name;
  version += 1;
}

/**
 * A StyleSheet that follows the theme: `themed(() => StyleSheet.create({…}))` builds it again after the
 * theme changes, instead of keeping the colours it had when the file loaded.
 */
export function themed<T extends object>(make: () => T): T {
  let built = -1;
  let styles = {} as T;
  return new Proxy({} as T, {
    get(_, key) {
      if (built !== version) {
        styles = make();
        built = version;
      }
      return styles[key as keyof T];
    },
  });
}

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 14,
  large: 22,
  pill: 999,
} as const;
