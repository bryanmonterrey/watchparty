import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

// Native port of components/auth/waiting-step.tsx — the full-page "waiting"
// login state shared by social logins (and passkey/wallet later): icon tile
// with a rotating accent arc, "Waiting for X", Continue + Back pills.
export function WaitingStep({
  name,
  description,
  icon,
  onContinue,
  onBack,
  backLabel = 'Back',
  busy,
  error,
}: {
  name: string;
  description: string;
  icon: ReactNode;
  onContinue: () => void;
  onBack?: () => void;
  backLabel?: string;
  busy?: boolean;
  error?: string | null;
}) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.container}>
      <View style={styles.tileWrap}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
          <AccentArc />
        </Animated.View>
        <View style={styles.tile}>{icon}</View>
      </View>

      <Text style={styles.title}>Waiting for {name}</Text>
      <Text style={styles.description}>{description}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        disabled={busy}
        style={({ pressed }) => [styles.continueButton, (pressed || busy) && styles.dim]}
        onPress={onContinue}>
        <Text style={styles.continueText}>Continue</Text>
      </Pressable>

      {onBack && (
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.dim]}
          onPress={onBack}>
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// Green arc fading to transparent, standing in for the web's conic-gradient.
function AccentArc() {
  return (
    <Svg width={92} height={92} viewBox="0 0 92 92" fill="none">
      <Defs>
        <LinearGradient id="arc" x1="46" y1="0" x2="92" y2="46" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#00ED89" />
          <Stop offset="1" stopColor="#00ED89" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path
        d="M46 1.5 A44.5 44.5 0 0 1 90.5 46"
        stroke="url(#arc)"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function FingerprintIcon() {
  return (
    <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
      <Path d="M12 11c0 3.5-.5 6-1.5 8" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M8.5 9.5A3.5 3.5 0 0 1 15.5 11c0 3-.4 5.5-1.2 7.5" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M5.5 11a6.5 6.5 0 0 1 13 0c0 1.2-.1 2.4-.3 3.5" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M12 11v1.5c0 2.8-.3 5.2-1 7.5" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M3.5 8.5a9 9 0 0 1 15.2-1.8" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  tileWrap: { marginTop: 64, width: 92, height: 92 },
  tile: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 22,
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 32,
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  description: {
    marginTop: 8,
    maxWidth: 300,
    textAlign: 'center',
    color: '#a1a1aa',
    fontSize: 15,
    lineHeight: 22,
  },
  error: { marginTop: 16, textAlign: 'center', color: '#f87171', fontSize: 13 },
  continueButton: {
    marginTop: 32,
    height: 68,
    borderRadius: 34,
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: { color: '#000', fontSize: 19, fontWeight: '600', letterSpacing: -0.3 },
  backButton: {
    marginTop: 12,
    height: 68,
    borderRadius: 34,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(106,106,106,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: '#fff', fontSize: 19, fontWeight: '600', letterSpacing: -0.3 },
  dim: { opacity: 0.7 },
});
