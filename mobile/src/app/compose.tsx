import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

const MAX_LENGTH = 500;

// Post composer, text-only v1 (web: components/browse/post-composer.tsx).
// Media, polls, paywall, scheduling and drafts come later.
export default function ComposeScreen() {
  const theme = useTheme();
  const { data: session } = authClient.useSession();
  const user = session?.user as { avatar_url?: string | null; image?: string | null } | undefined;
  const avatar = user?.avatar_url ?? user?.image ?? null;

  const [text, setText] = useState('');
  const utils = trpc.useUtils();
  const create = trpc.content.createPost.useMutation({
    onSuccess: () => {
      utils.content.getFeed.invalidate();
      router.back();
    },
  });

  const canPost = text.trim().length > 0 && text.length <= MAX_LENGTH && !create.isPending;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}>
            <Pressable hitSlop={8} onPress={() => router.back()}>
              <Text style={[styles.cancel, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.postButton, { backgroundColor: theme.text }, !canPost && styles.dim]}
              disabled={!canPost}
              onPress={() => create.mutate({ content: text.trim() })}>
              {create.isPending ? (
                <ActivityIndicator size="small" color={theme.background} />
              ) : (
                <Text style={[styles.postText, { color: theme.background }]}>Post</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.body}>
            <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
              {avatar && <Image source={{ uri: avatar }} style={styles.fill} contentFit="cover" />}
            </View>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="What's happening?"
              placeholderTextColor={theme.textSecondary}
              multiline
              autoFocus
              maxLength={MAX_LENGTH + 50}
              value={text}
              onChangeText={setText}
            />
          </View>

          <View style={styles.footer}>
            {create.error && (
              <Text style={styles.error}>{create.error.message || "Couldn't post."}</Text>
            )}
            <Text
              style={[
                styles.counter,
                { color: text.length > MAX_LENGTH ? '#ef4444' : theme.textSecondary },
              ]}>
              {text.length}/{MAX_LENGTH}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancel: { fontSize: 16 },
  postButton: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  postText: { fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.4 },
  body: { flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  input: { flex: 1, fontSize: 17, lineHeight: 23, paddingTop: 8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  error: { flex: 1, color: '#ef4444', fontSize: 13 },
  counter: { fontSize: 13 },
});
