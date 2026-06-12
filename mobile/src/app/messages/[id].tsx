import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock } from 'lucide-react-native';
import type { inferRouterOutputs } from '@trpc/server';

import { BackArrowIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { relativeTime } from '@/lib/format';
// Type-only import (see src/lib/trpc.ts) — never a value import.
import type { AppRouter } from '@/server/routers';
import { trpc } from '@/lib/trpc';

type Message = inferRouterOutputs<AppRouter>['message']['list']['messages'][number];

// Conversation thread — read-only v1. Message bodies are E2E encrypted on
// the web; until the crypto layer is ported (task #10) encrypted bubbles
// show a lock placeholder and the composer stays disabled.
export default function ThreadScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = authClient.useSession();

  const messages = trpc.message.list.useQuery({ conversationId: id, limit: 100 });
  const conversation = trpc.conversation.get.useQuery({ conversationId: id });

  const utils = trpc.useUtils();
  const markAsRead = trpc.conversation.markAsRead.useMutation({
    onSuccess: () => utils.conversation.getUnreadCount.invalidate(),
  });

  useEffect(() => {
    markAsRead.mutate({ conversationId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const convo = conversation.data?.conversation;
  const title =
    (convo?.isGroup ? convo?.groupName : convo?.otherParticipant?.name) ?? 'Conversation';
  const rows = [...(messages.data?.messages ?? [])].reverse();

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
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
              <MessageBubble message={item} mine={item.senderId === session?.user.id} />
            )}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={{ color: theme.textSecondary }}>No messages yet.</Text>
              </View>
            }
          />
        )}

        <View style={[styles.composer, { backgroundColor: theme.backgroundElement }]}>
          <Lock size={16} color={theme.textSecondary} />
          <Text style={[styles.composerNote, { color: theme.textSecondary }]}>
            End-to-end encrypted replies are coming to the app soon.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function MessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  const theme = useTheme();

  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : null]}>
      <View
        style={[
          styles.bubble,
          mine
            ? styles.mineBubble
            : { backgroundColor: theme.backgroundElement },
        ]}>
        {message.isEncrypted ? (
          <View style={styles.encryptedRow}>
            <Lock size={14} color={mine ? 'rgba(255,255,255,0.8)' : theme.textSecondary} />
            <Text
              style={[
                styles.encryptedText,
                { color: mine ? 'rgba(255,255,255,0.8)' : theme.textSecondary },
              ]}>
              Encrypted message
            </Text>
          </View>
        ) : (
          <Text style={[styles.bubbleText, { color: mine ? '#fff' : theme.text }]}>
            {message.content}
          </Text>
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
