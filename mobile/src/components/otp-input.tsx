import { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

/**
 * Native port of components/auth/otp-input.tsx. One invisible TextInput
 * drives all cells — that's what makes iOS one-time-code autofill (the
 * keyboard suggestion above the number pad) work, unlike per-cell inputs.
 */
export function OtpInput({ value, onChange, onComplete, length = 6, disabled }: OtpInputProps) {
  const input = useRef<TextInput>(null);

  function commit(raw: string) {
    const clean = raw.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  }

  return (
    <Pressable onPress={() => input.current?.focus()}>
      <View style={styles.row}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              value[i] ? styles.cellFilled : null,
              i === Math.min(value.length, length - 1) ? styles.cellActive : null,
            ]}>
            <Text style={styles.digit}>{value[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={input}
        style={styles.hidden}
        value={value}
        onChangeText={commit}
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(106,106,106,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { backgroundColor: 'rgba(106,106,106,0.55)' },
  cellActive: { backgroundColor: 'rgba(106,106,106,0.7)' },
  digit: { color: '#fff', fontSize: 20, fontWeight: '600' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
