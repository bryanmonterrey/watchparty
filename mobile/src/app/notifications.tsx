import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrowIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { relativeTime } from '@/lib/format';
import { trpc } from '@/lib/trpc';

interface NotificationRow {
  id: string;
  type: string;
  postId: string | null;
  body: string | null;
  isRead: boolean | null;
  createdAt: Date | string | null;
  actor: { name: string | null; username: string | null; avatar_url: string | null } | null;
}

const TYPE_TEXT: Record<string, string> = {
  follow: 'followed you',
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to you',
  repost: 'reposted your post',
  mention: 'mentioned you',
};

export default function NotificationsScreen() {
  const theme = useTheme();

  const list = trpc.notification.getNotifications.useInfiniteQuery(
    { limit: 30 },
    { getNextPageParam: (p) => p.nextCursor },
  );
  const utils = trpc.useUtils();
  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => utils.notification.getUnreadCount.invalidate(),
  });

  useEffect(() => {
    markAllRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = (list.data?.pages.flatMap((p) => p.notifications) ??
    []) as unknown as NotificationRow[];

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
          <Pressable hitSlop={12} onPress={() => router.back()}>
            <BackArrowIcon size={22} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
          <View style={styles.headerSpacer} />
        </View>

        {list.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(n) => n.id}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
            }}
            renderItem={({ item }) => <NotificationItem n={item} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={{ color: theme.textSecondary }}>Nothing here yet.</Text>
              </View>
            }
            ListFooterComponent={
              list.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

function NotificationItem({ n }: { n: NotificationRow }) {
  const theme = useTheme();
  const text = TYPE_TEXT[n.type] ?? n.body ?? n.type;

  function open() {
    if (n.postId) router.push(`/comments/${n.postId}`);
    else if (n.actor?.username) router.push(`/profile/${n.actor.username}`);
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !n.isRead && { backgroundColor: theme.backgroundElement },
        pressed && { opacity: 0.7 },
      ]}
      onPress={open}>
      <Pressable
        disabled={!n.actor?.username}
        onPress={() => router.push(`/profile/${n.actor!.username}`)}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
          {n.actor?.avatar_url && (
            <Image source={{ uri: n.actor.avatar_url }} style={styles.fill} contentFit="cover" />
          )}
        </View>
      </Pressable>
      <View style={styles.flex}>
        <Text style={[styles.text, { color: theme.text }]} numberOfLines={2}>
          <Text style={styles.name}>{n.actor?.name ?? n.actor?.username ?? 'Someone'}</Text> {text}
        </Text>
        <Text style={[styles.time, { color: theme.textSecondary }]}>
          {relativeTime(n.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
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
  footer: { paddingVertical: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  text: { fontSize: 14, lineHeight: 19 },
  name: { fontWeight: '700' },
  time: { fontSize: 12, marginTop: 2 },
});
