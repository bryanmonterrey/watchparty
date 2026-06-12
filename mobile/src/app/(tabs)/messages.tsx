import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Search as SearchIcon } from 'lucide-react-native';

import { AppHeader, useHeaderInset } from '@/components/app-header';
import { useTheme } from '@/hooks/use-theme';
import { useE2E } from '@/hooks/use-e2e';
import { decryptText, type E2EKeys } from '@/lib/e2e';
import { relativeTime } from '@/lib/format';
import { trpc } from '@/lib/trpc';

// Structural row type — conversation.list's inferred type collapses to
// never under mobile tsc (drizzle aliasedTable quirk), so declare what we
// read. Fields mirror server/routers/conversation.ts list select.
interface Conversation {
  id: string;
  isGroup: boolean | null;
  groupName: string | null;
  groupAvatar: string | null;
  otherParticipantName: string | null;
  otherParticipantAvatar: string | null;
  otherParticipantPublicKey: string | null;
  lastMessageAt: Date | string | null;
  lastMessageContent: string | null;
  lastMessageIsEncrypted: boolean | null;
  lastMessageIv: string | null;
}

// Messages inbox, from "public/mobile designs/Messages page mobile
// landing.svg": big title chrome, search pill, "Inbox (n)" + Requests,
// conversation rows (avatar, name, preview, time). Message bodies are E2E
// encrypted — encrypted previews show a placeholder until the crypto layer
// is ported (task #10).
export default function MessagesScreen() {
  const theme = useTheme();
  const headerInset = useHeaderInset();
  const router = useRouter();
  const [filter, setFilter] = useState('');

  const list = trpc.conversation.list.useQuery();
  const unread = trpc.conversation.getUnreadCount.useQuery();
  const { keys } = useE2E();

  const conversations = useMemo(() => {
    // Cast: the server's inferred row type collapses to never (see above).
    const all = (list.data?.conversations ?? []) as unknown as Conversation[];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) =>
      (c.isGroup ? c.groupName : c.otherParticipantName)?.toLowerCase().includes(q),
    );
  }, [list.data, filter]);

  return (
    <View style={styles.flex}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingTop: headerInset + 108 }}
        showsVerticalScrollIndicator={false}
        refreshing={list.isRefetching}
        onRefresh={() => list.refetch()}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            keys={keys}
            onPress={() => router.push(`/messages/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            {list.isPending ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: theme.textSecondary }}>
                {filter ? 'No conversations match.' : 'No messages yet.'}
              </Text>
            )}
          </View>
        }
      />

      {/* Search pill + Inbox header, below the glass chrome */}
      <View style={[styles.controls, { top: headerInset + 8 }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement }]}>
          <SearchIcon size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            value={filter}
            onChangeText={setFilter}
          />
        </View>
        <View style={styles.inboxRow}>
          <Text style={[styles.inboxTitle, { color: theme.text }]}>
            Inbox{unread.data?.count ? ` (${unread.data.count})` : ''}
          </Text>
          <Text style={[styles.requests, { color: theme.text }]}>Requests</Text>
        </View>
      </View>

      <AppHeader title="Messages" />
    </View>
  );
}

function ConversationRow({
  conversation: c,
  keys,
  onPress,
}: {
  conversation: Conversation;
  keys: E2EKeys | null;
  onPress: () => void;
}) {
  const theme = useTheme();

  const name = (c.isGroup ? c.groupName : c.otherParticipantName) ?? 'Conversation';
  const avatar = c.isGroup ? c.groupAvatar : c.otherParticipantAvatar;
  // ECDH is symmetric, so the partner's key decrypts previews either way.
  const decrypted =
    c.lastMessageIsEncrypted && c.lastMessageContent && c.lastMessageIv && keys && c.otherParticipantPublicKey
      ? decryptText(c.lastMessageContent, c.lastMessageIv, keys, c.otherParticipantPublicKey)
      : null;
  const preview = c.lastMessageIsEncrypted
    ? (decrypted ?? 'Encrypted message')
    : (c.lastMessageContent ?? 'Say hi 👋');

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.backgroundElement },
        pressed && { backgroundColor: theme.backgroundElement },
      ]}
      onPress={onPress}>
      <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
        {avatar && <Image source={{ uri: avatar }} style={styles.fill} contentFit="cover" />}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text
          style={[
            styles.preview,
            { color: theme.textSecondary },
            c.lastMessageIsEncrypted && !decrypted ? styles.encrypted : null,
          ]}
          numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <Text style={[styles.time, { color: theme.textSecondary }]}>
        {relativeTime(c.lastMessageAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  controls: { position: 'absolute', left: 16, right: 16, zIndex: 30, gap: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, height: '100%' },
  inboxRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  inboxTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  requests: { fontSize: 14, fontWeight: '600' },
  empty: { paddingTop: 140, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden' },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  preview: { fontSize: 14, marginTop: 2 },
  encrypted: { fontStyle: 'italic' },
  time: { fontSize: 13, alignSelf: 'flex-start', marginTop: 4 },
});
