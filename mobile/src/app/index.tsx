import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Redirect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';

/**
 * Sign-in: email OTP against the same better-auth backend as the web app.
 * Dev note: with no RESEND_API_KEY on the Next.js server, the OTP code is
 * printed to the `bun dev` console instead of being emailed.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sessionPending) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (session) {
    return <Redirect href="/home" />;
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: 'sign-in',
    });
    setBusy(false);
    if (error) setError(error.message ?? 'Failed to send code');
    else setStep('otp');
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp: otp.trim(),
    });
    setBusy(false);
    if (error) setError(error.message ?? 'Invalid code');
    // On success useSession() refreshes and the <Redirect> above takes over.
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.backgroundElement, color: theme.text },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">Watchparty</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.tagline}>
          {step === 'email'
            ? 'Sign in with your email'
            : `Enter the code sent to ${email.trim()}`}
        </ThemedText>

        {step === 'email' ? (
          <TextInput
            style={inputStyle}
            placeholder="you@example.com"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendCode}
          />
        ) : (
          <TextInput
            style={inputStyle}
            placeholder="123456"
            placeholderTextColor={theme.textSecondary}
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={setOtp}
            onSubmitEditing={verifyCode}
          />
        )}

        {error && (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          disabled={busy || (step === 'email' ? !email.trim() : otp.length < 6)}
          onPress={step === 'email' ? sendCode : verifyCode}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>
              {step === 'email' ? 'Send code' : 'Sign in'}
            </ThemedText>
          )}
        </Pressable>

        {step === 'otp' && (
          <Pressable onPress={() => setStep('email')} disabled={busy}>
            <ThemedText type="link" themeColor="textSecondary">
              Use a different email
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  tagline: { marginTop: -Spacing.two },
  input: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: { color: '#ef4444' },
  button: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontWeight: 600 },
});
