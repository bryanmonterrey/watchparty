import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUp, Lock } from 'lucide-react-native';

import { BackArrowIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { useE2E } from '@/hooks/use-e2e';
import { authClient } from '@/lib/auth-client';
import { decryptText, encryptText, type E2EKeys } from '@/lib/e2e';
import { relativeTime } from '@/lib/format';
import { trpc } from '@/lib/trpc';

// Conversation thread with the full E2E layer (ECDH P-256 + AES-GCM,
// shared identity with web via cloud-synced keys). 1:1 conversations
// decrypt and send; group E2E (per-recipient fan-out) comes later.

interface ThreadMessage {
  id: string;
  senderId: string | null;
  content: string | null;
  encryptionIv?: string | null;
  isEncrypted: boolean | null;
  createdAt: Date | string | null;
}

export default function ThreadScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = authClient.useSession();
  const { keys, ready } = useE2E();

  const messages = trpc.message.list.useQuery({ conversationId: id, limit: 100 });
  const conversation = trpc.conversation.get.useQuery({ conversationId: id });
  const participants = trpc.conversation.getParticipants.useQuery({ conversationId: id });

  const convo = conversation.data?.conversation;
  const partner = participants.data?.participants?.find((p) => p.userId !== session?.user.id);
  const partnerKey = trpc.encryption.getPublicKey.useQuery(
    { userId: partner?.userId ?? '' },
    { enabled: !!partner?.userId && !convo?.isGroup },
  );
  const partnerPub = partnerKey.data?.publicKey ?? null;

  const utils = trpc.useUtils();
  const markAsRead = trpc.conversation.markAsRead.useMutation({
    onSuccess: () => utils.conversation.getUnreadCount.invalidate(),
  });
  const send = trpc.message.send.useMutation({
    onSuccess: () => {
      utils.message.list.invalidate({ conversationId: id });
      utils.conversation.list.invalidate();
    },
  });

  const [draft, setDraft] = useState('');
  const canSend = ready && !!partnerPub && !convo?.isGroup;

  useEffect(() => {
    markAsRead.mutate({ conversationId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function sendMessage() {
    const text = draft.trim();
    if (!text || !keys || !partnerPub || send.isPending) return;
    const { ciphertext, iv } = encryptText(text, keys, partnerPub);
    send.mutate({ conversationId: id, content: ciphertext, encryptionIv: iv });
    setDraft('');
  }

  const title = (convo?.isGroup ? convo?.groupName : (partner?.name ?? partner?.username)) ?? 'Conversation';
  const rows = [...((messages.data?.messages ?? []) as unknown as ThreadMessage[])].reverse();

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
            <Pressable hitSlop={12} onPress={() => router.back()}>
              <BackArrowIcon size={22} />
            </Pressable>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          {messages.isPending ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              inverted
              data={rows}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <MessageBubble
                  message={item}
                  mine={item.senderId === session?.user.id}
                  keys={keys}
                  partnerPub={partnerPub}
                />
              )}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={{ color: theme.textSecondary }}>No messages yet.</Text>
                </View>
              }
            />
          )}

          {canSend ? (
            <View style={[styles.composer, { backgroundColor: theme.backgroundElement }]}>
              <TextInput
                style={[styles.composerInput, { color: theme.text }]}
                placeholder="Message"
                placeholderTextColor={theme.textSecondary}
                value={draft}
                onChangeText={setDraft}
                multiline
              />
              <Pressable
                style={[styles.sendButton, (!draft.trim() || send.isPending) && styles.dim]}
                disabled={!draft.trim() || send.isPending}
                onPress={sendMessage}>
                {send.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ArrowUp size={18} color="#fff" />
                )}
              </Pressable>
            </View>
          ) : (
            <View style={[styles.composerDisabled, { backgroundColor: theme.backgroundElement }]}>
              <Lock size={16} color={theme.textSecondary} />
              <Text style={[styles.composerNote, { color: theme.textSecondary }]}>
                {convo?.isGroup
                  ? 'Group replies are coming to the app soon.'
                  : 'Setting up encryption…'}
              </Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function MessageBubble({
  message,
  mine,
  keys,
  partnerPub,
}: {
  message: ThreadMessage;
  mine: boolean;
  keys: E2EKeys | null;
  partnerPub: string | null;
}) {
  const theme = useTheme();

  // ECDH is symmetric: one shared key decrypts both directions in a 1:1.
  const decrypted =
    message.isEncrypted && message.content && message.encryptionIv && keys && partnerPub
      ? decryptText(message.content, message.encryptionIv, keys, partnerPub)
      : null;
  const text = message.isEncrypted ? decrypted : message.content;

  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : null]}>
      <View
        style={[
          styles.bubble,
          mine ? styles.mineBubble : { backgroundColor: theme.backgroundElement },
        ]}>
        {text != null ? (
          <Text style={[styles.bubbleText, { color: mine ? '#fff' : theme.text }]}>{text}</Text>
        ) : (
          <View style={styles.encryptedRow}>
            <Lock size={14} color={mine ? 'rgba(255,255,255,0.8)' : theme.textSecondary} />
            <Text
              style={[
                styles.encryptedText,
                { color: mine ? 'rgba(255,255,255,0.8)' : theme.textSecondary },
              ]}>
              {message.isEncrypted && keys && partnerPub
                ? "Couldn't decrypt"
                : 'Encrypted message'}
            </Text>
          </View>
        )}
        <Text
          style={[
            styles.bubbleTime,
            { color: mine ? 'rgba(255,255,255,0.6)' : theme.textSecondary },
          ]}>
          {relativeTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  headerSpacer: { width: 22 },
  list: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  bubbleRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 2,
  },
  mineBubble: { backgroundColor: '#208AEF' },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 11, alignSelf: 'flex-end' },
  encryptedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  encryptedText: { fontSize: 14, fontStyle: 'italic' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  composerInput: { flex: 1, fontSize: 15, maxHeight: 110, paddingTop: 6, paddingBottom: 6 },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
  composerDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    height: 44,
    borderRadius: 22,
  },
  composerNote: { fontSize: 13 },
});
