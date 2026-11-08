import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/store/session';
import { AppThemeProvider, useTheme } from '@/store/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <Themed />
    </AppThemeProvider>
  );
}

/** Navigation and status bar in the colours of the active theme. */
function Themed() {
  const { theme } = useTheme();
  const light = theme === 'claro';
  const base = light ? DefaultTheme : DarkTheme;
  const navigation = {
    ...base,
    colors: {
      ...base.colors,
      primary: Colors.accent,
      background: Colors.background,
      card: Colors.background,
      text: Colors.text,
      border: Colors.border,
    },
  };
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ThemeProvider value={navigation}>
        <SessionProvider>
          <RootNavigator />
          <StatusBar style={light ? 'dark' : 'light'} />
        </SessionProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading) SplashScreen.hide();
  }, [loading]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
