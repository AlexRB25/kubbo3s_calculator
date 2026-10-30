import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Muted } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { authErrorMessage, supabase, supabaseConfigured } from '@/lib/supabase';

export default function SignInScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';
  // Signed up (or tried to enter) without confirming the email yet: wait for it and then enter by itself.
  const [waiting, setWaiting] = useState(false);

  async function submit() {
    setError('');
    setNotice('');
    if (!supabaseConfigured) return setError('Falta configurar Supabase: copia .env.example como .env.local y rellénalo.');
    if (isRegister && name.trim().length < 2) return setError('Escribe tu nombre.');
    if (!email.trim() || password.length < (isRegister ? 8 : 1)) {
      return setError(isRegister ? 'Escribe tu correo y una contraseña de al menos 8 caracteres.' : 'Escribe tu correo y contraseña.');
    }

    setBusy(true);
    const { data, error } = isRegister
      ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);

    // On success with a session, the root layout swaps to the app screens by itself.
    if (error?.code === 'email_not_confirmed') setWaiting(true);
    else if (error) setError(authErrorMessage(error));
    else if (!data.session && data.user?.identities?.length === 0) setError('Ya existe una cuenta con ese correo.');
    else if (!data.session) setWaiting(true);
  }

  if (waiting) {
    return (
      <SafeAreaView style={styles.safe}>
        <WaitForEmail
          email={email.trim()}
          password={password}
          onBack={() => {
            setWaiting(false);
            setMode('register');
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <Image source={require('@/assets/images/logo.png')} style={styles.mark} contentFit="contain" />
        <Text style={styles.logo}>
          Kubbo<Text style={{ color: Colors.accent }}>3D</Text>
        </Text>
        <Muted style={{ textAlign: 'center' }}>Costos, filamento, impresiones y ventas de tu taller 3D.</Muted>

        <View style={styles.form}>
          <Text style={styles.title}>{isRegister ? 'Crea tu cuenta' : 'Entrar'}</Text>
          {isRegister && (
            <TextInput
              style={styles.input}
              placeholder="Nombre"
              placeholderTextColor={Colors.textSecondary}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              maxLength={40}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Correo"
            placeholderTextColor={Colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor={Colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            maxLength={72}
            onSubmitEditing={submit}
          />
          <ErrorText>{error}</ErrorText>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Button label={isRegister ? 'Crear cuenta' : 'Entrar'} onPress={submit} loading={busy} />
          <Button
            variant="secondary"
            label={isRegister ? 'Ya tengo cuenta' : 'Crear una cuenta'}
            onPress={() => {
              setMode(isRegister ? 'login' : 'register');
              setError('');
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Seconds between checks: Supabase limits sign-ins per IP, so not much more often than this. */
const CHECK_EVERY = 12;
const RESEND_WAIT = 60;

/**
 * Waits for the email to be confirmed (from this phone or another device) and then signs in with the
 * password just typed, kept only in memory, so it is never typed again. It checks every few seconds while
 * the app is open, when it comes back from the email app, and with "Ya lo confirmé".
 */
function WaitForEmail({ email, password, onBack }: { email: string; password: string; onBack: () => void }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_WAIT);
  const done = useRef(false);

  const check = useCallback(
    async (byHand: boolean) => {
      if (done.current) return;
      if (byHand) setChecking(true);
      // Once it works the root layout swaps to the app screens by itself.
      const { error: failed } = await supabase.auth.signInWithPassword({ email, password });
      if (byHand) setChecking(false);
      if (!failed) {
        done.current = true;
        setStatus('¡Correo confirmado! Entrando…');
      } else if (failed.code === 'email_not_confirmed') {
        if (byHand) setStatus('Todavía no vemos la confirmación. Abre el enlace del correo y vuelve a intentar.');
      } else {
        if (failed.code === 'invalid_credentials') done.current = true;
        setError(authErrorMessage(failed));
      }
    },
    [email, password],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') check(false);
    }, CHECK_EVERY * 1000);
    // Back from the email app: check right away.
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && check(false));
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [check]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function resend() {
    setError('');
    setStatus('');
    const { error: failed } = await supabase.auth.resend({ type: 'signup', email });
    if (failed) return setError(authErrorMessage(failed));
    setResendIn(RESEND_WAIT);
    setStatus('Te enviamos el correo otra vez.');
  }

  return (
    <View style={styles.center}>
      <View style={styles.form}>
        <Text style={[styles.title, { textAlign: 'center' }]}>Confirma tu correo</Text>
        <Muted style={{ textAlign: 'center' }}>
          Te enviamos un enlace a <Text style={{ color: Colors.text, fontWeight: '700' }}>{email}</Text>. Ábrelo desde este celular o desde otro
          dispositivo: en cuanto lo confirmes entras solo, sin volver a escribir tu contraseña.
        </Muted>
        <Text style={styles.notice}>{status || 'Esperando tu confirmación…'}</Text>
        <ErrorText>{error}</ErrorText>
        <Button label={checking ? 'Revisando…' : 'Ya lo confirmé'} onPress={() => check(true)} loading={checking} />
        <Button
          variant="secondary"
          label={resendIn > 0 ? `Reenviar correo (${resendIn} s)` : 'Reenviar correo'}
          onPress={resend}
          disabled={resendIn > 0}
        />
        <Muted style={{ textAlign: 'center' }}>¿No te llega? Revisa spam o promociones.</Muted>
        <Button variant="secondary" label="Usar otro correo" onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  mark: { width: 96, height: 96, alignSelf: 'center' },
  logo: { color: Colors.text, fontSize: 40, fontWeight: '900', textAlign: 'center', letterSpacing: -1 },
  form: {
    marginTop: Spacing.four,
    gap: Spacing.three,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.large,
    padding: Spacing.three,
  },
  title: { color: Colors.text, fontSize: 22, fontWeight: '700' },
  input: {
    minHeight: 48,
    backgroundColor: Colors.background,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    color: Colors.text,
    fontSize: 16,
  },
  notice: {
    color: Colors.gold,
    backgroundColor: 'rgba(245, 184, 61, 0.12)',
    borderRadius: Radius.small,
    padding: Spacing.three,
    fontSize: 14,
    overflow: 'hidden',
  },
});
