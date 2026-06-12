import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackArrowIcon,
  CheckGlyph,
  DiscordIcon,
  GoogleIcon,
  KickIcon,
  MessagesIcon,
  Star2Icon,
  TwitchIcon,
  XIcon,
} from '@/components/icons';
import { OtpInput } from '@/components/otp-input';
import { authClient } from '@/lib/auth-client';

// Native port of the web login (components/auth/login-card.tsx): same dark
// single-screen flow with swapped states. Email OTP is fully wired; OAuth,
// wallet, and passkey render per the design but land in a later pass.
const PROVIDERS = [
  { id: 'google', label: 'Continue with Google', Icon: GoogleIcon, size: 26 },
  { id: 'x', label: 'Continue with X', Icon: XIcon, size: 24 },
  { id: 'twitch', label: 'Continue with Twitch', Icon: TwitchIcon, size: 26 },
  { id: 'kick', label: 'Continue with Kick', Icon: KickIcon, size: 23 },
  { id: 'discord', label: 'Continue with Discord', Icon: DiscordIcon, size: 33 },
] as const;

const RESEND_COOLDOWN = 60;

type Step = 'methods' | 'confirm';

export default function LoginScreen() {
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [step, setStep] = useState<Step>('methods');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  if (sessionPending) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/home" />;
  }

  const canSend = /\S+@\S+\.\S+/.test(email);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timer.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function sendCode() {
    if (!canSend || sending) return;
    setError(null);
    setSending(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: 'sign-in',
    });
    setSending(false);
    if (error) {
      setError(error.message ?? "Couldn't send the code. Try again.");
      return;
    }
    setOtp('');
    startCooldown();
    setStep('confirm');
  }

  async function verify(code: string) {
    if (verifying || code.length !== 6) return;
    setError(null);
    setVerifying(true);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code });
    setVerifying(false);
    if (error) {
      setError(error.message ?? 'Invalid or expired code.');
      setOtp('');
    }
    // On success useSession() refreshes and <Redirect> takes over.
  }

  async function resend() {
    if (cooldown > 0 || sending) return;
    setSending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: 'sign-in',
    });
    setSending(false);
    if (error) {
      setError(error.message ?? "Couldn't resend the code.");
      return;
    }
    startCooldown();
  }

  function comingSoon(what: string) {
    Alert.alert(what, `${what} is coming to the iOS app soon. Use email for now.`);
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            bounces={false}>
            {step === 'confirm' && (
              <Pressable
                style={styles.back}
                hitSlop={12}
                onPress={() => {
                  setError(null);
                  setStep('methods');
                }}>
                <BackArrowIcon />
              </Pressable>
            )}

            <View style={styles.column}>
              {/* Logo — shared across states */}
              <View style={styles.logo}>
                <Star2Icon size={28} />
              </View>

              {step === 'methods' ? (
                <>
                  <Text style={styles.heading}>Login</Text>

                  {/* OAuth providers */}
                  <View style={styles.providerRow}>
                    {PROVIDERS.map(({ id, label, Icon, size }) => (
                      <Pressable
                        key={id}
                        accessibilityLabel={label}
                        style={({ pressed }) => [
                          styles.providerButton,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => comingSoon(label.replace('Continue with ', '') + ' sign-in')}>
                        <Icon size={size} />
                      </Pressable>
                    ))}
                  </View>

                  {/* Email → send code (OTP) */}
                  <View style={styles.emailRow}>
                    <MessagesIcon size={26} />
                    <TextInput
                      style={styles.emailInput}
                      placeholder="your@email.com"
                      placeholderTextColor="#71717a"
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={setEmail}
                      onSubmitEditing={sendCode}
                    />
                    <Pressable disabled={!canSend || sending} onPress={sendCode} hitSlop={8}>
                      <View style={styles.sendCode}>
                        {sending && <ActivityIndicator size="small" color="#207AFF" />}
                        <Text style={[styles.sendCodeText, canSend && !sending && styles.sendCodeActive]}>
                          send code
                        </Text>
                      </View>
                    </Pressable>
                  </View>

                  <Text style={styles.or}>OR</Text>

                  {/* Connect Wallet */}
                  <Pressable
                    style={({ pressed }) => [styles.walletButton, pressed && styles.pressed]}
                    onPress={() => comingSoon('Wallet sign-in')}>
                    <Text style={styles.walletText}>Connect Wallet</Text>
                  </Pressable>

                  <Pressable onPress={() => comingSoon('Passkey sign-in')}>
                    <Text style={styles.passkey}>Sign in with Passkey</Text>
                  </Pressable>

                  {error && <Text style={styles.error}>{error}</Text>}

                  {/* Legal */}
                  <View style={styles.legal}>
                    <Text style={styles.legalText}>
                      By entering and clicking Continue, you agree to the{' '}
                      <Text style={styles.legalLink}>Terms</Text>,{' '}
                      <Text style={styles.legalLink}>E-Sign Consent</Text>, &{' '}
                      <Text style={styles.legalLink}>Privacy Policy</Text>.
                    </Text>
                    <Text style={styles.legalText}>
                      By entering and clicking Continue, you also agree to receive a one time
                      password confirmation code and informational texts from Watchparty. Message
                      frequency varies. Message and data rates may apply. Reply HELP for help, STOP
                      to cancel.
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.heading}>Confirm Email</Text>
                  <Text style={styles.confirmSubtitle}>
                    Enter the verification code sent to <Text style={styles.confirmEmail}>{email.trim()}</Text>
                  </Text>

                  <View style={styles.otpWrap}>
                    <OtpInput value={otp} onChange={setOtp} onComplete={verify} disabled={verifying} />
                  </View>

                  <Pressable
                    disabled={otp.length !== 6 || verifying}
                    style={({ pressed }) => [
                      styles.completeButton,
                      (otp.length !== 6 || verifying) && styles.completeDisabled,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => verify(otp)}>
                    {verifying ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <CheckGlyph size={18} />
                    )}
                    <Text style={styles.completeText}>Complete</Text>
                  </Pressable>

                  {error && <Text style={styles.error}>{error}</Text>}

                  <Pressable disabled={cooldown > 0 || sending} onPress={resend}>
                    <Text style={styles.resend}>
                      {sending
                        ? 'Sending…'
                        : cooldown > 0
                          ? `Resend code in ${cooldown}s`
                          : 'Resend code'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>

            {/* Wordmark — shared across states */}
            <Text style={styles.wordmark}>watchparty</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // The login screen is always dark, matching the web design.
  screen: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  back: { position: 'absolute', left: 16, top: 8, zIndex: 1, padding: 8 },
  column: { width: '100%', maxWidth: 442, alignSelf: 'center', paddingTop: 56 },
  logo: { alignItems: 'center' },
  heading: {
    marginTop: 28,
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  providerRow: { marginTop: 20, flexDirection: 'row', gap: 10 },
  providerButton: {
    flex: 1,
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(106,106,106,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  emailRow: {
    marginTop: 24,
    height: 68,
    borderRadius: 28,
    backgroundColor: 'rgba(106,106,106,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 16,
  },
  emailInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%' },
  sendCode: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sendCodeText: { color: '#71717a', fontSize: 14, fontWeight: '500' },
  sendCodeActive: { color: '#207AFF' },
  or: {
    marginVertical: 24,
    textAlign: 'center',
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  walletButton: {
    height: 68,
    borderRadius: 34,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletText: { color: '#000', fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },
  passkey: {
    marginTop: 24,
    textAlign: 'center',
    color: '#1D9BF0',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  error: { marginTop: 16, textAlign: 'center', color: '#f87171', fontSize: 13 },
  legal: { marginTop: 28, gap: 16 },
  legalText: { textAlign: 'center', color: '#71717a', fontSize: 11, lineHeight: 17 },
  legalLink: { color: '#a1a1aa', textDecorationLine: 'underline' },
  confirmSubtitle: { marginTop: 8, color: '#a1a1aa', fontSize: 15 },
  confirmEmail: { color: '#fff' },
  otpWrap: { marginTop: 28 },
  completeButton: {
    marginTop: 28,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#00ED89',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeDisabled: { opacity: 0.5 },
  completeText: { color: '#000', fontSize: 16, fontWeight: '600' },
  resend: { marginTop: 24, textAlign: 'center', color: '#71717a', fontSize: 14 },
  wordmark: {
    marginTop: 'auto',
    paddingVertical: 36,
    textAlign: 'center',
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
});
