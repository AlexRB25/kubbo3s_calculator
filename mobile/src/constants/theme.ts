export const Colors = {
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
} as const;

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
