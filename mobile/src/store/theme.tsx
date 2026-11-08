import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, Fragment, use, useEffect, useState, type PropsWithChildren } from 'react';

import { applyTheme, Colors, isThemeName, type ThemeName } from '@/constants/theme';

const KEY = 'kubbo3d.theme';

type ThemeState = { theme: ThemeName; setTheme: (name: ThemeName) => void };

const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const value = use(ThemeContext);
  if (!value) throw new Error('useTheme debe usarse dentro de <AppThemeProvider>');
  return value;
}

/**
 * The theme the user picked on this phone. Nothing renders until it is read (the splash stays up), and
 * the whole app is drawn again when it changes so every screen takes the new colours.
 */
export function AppThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemeName | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .catch(() => null)
      .then((stored) => {
        const name = isThemeName(stored) ? stored : 'oscuro';
        applyTheme(name);
        SystemUI.setBackgroundColorAsync(Colors.background).catch(() => {});
        setThemeState(name);
      });
  }, []);

  function setTheme(name: ThemeName) {
    applyTheme(name);
    SystemUI.setBackgroundColorAsync(Colors.background).catch(() => {});
    setThemeState(name);
    AsyncStorage.setItem(KEY, name).catch(() => {});
  }

  if (!theme) return null;
  return (
    <ThemeContext value={{ theme, setTheme }}>
      <Fragment key={theme}>{children}</Fragment>
    </ThemeContext>
  );
}
