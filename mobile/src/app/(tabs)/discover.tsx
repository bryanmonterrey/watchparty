import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';

import { AppHeader, useHeaderInset } from '@/components/app-header';
import { PostCard } from '@/components/post-card';
import { useTheme } from '@/hooks/use-theme';
import { trpc } from '@/lib/trpc';

const TABS = [
  { id: 'for-you', label: 'For You' },
  { id: 'following', label: 'Following' },
] as const;

type FeedType = (typeof TABS)[number]['id'];

// Discover: the social posts feed (web: components/browse/discover-client +
// browse-feed). v1 = For You / Following with infinite scroll.
export default function DiscoverScreen() {
  const theme = useTheme();
  const headerInset = useHeaderInset();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [type, setType] = useState<FeedType>('for-you');

  const compose = () => router.push('/compose');

  const feed = trpc.content.getFeed.useInfiniteQuery(
    { type, limit: 20 },
    { getNextPageParam: (p) => p.nextCursor },
  );

  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];

  return (
    <View style={styles.flex}>
      <FlatList
        data={posts}
        // feedKey, not id: repost rows share the original post's id.
        keyExtractor={(p, i) => p.feedKey ?? `${p.id}-${i}`}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={{ paddingTop: headerInset + 56 }}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
        }}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onRefresh={() => feed.refetch()}
        ListEmptyComponent={
          <View style={styles.empty}>
            {feed.isPending ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: theme.textSecondary }}>
                {type === 'following'
                  ? 'Posts from people you follow show up here.'
                  : 'Nothing here yet.'}
              </Text>
            )}
          </View>
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null
        }
      />

      {/* Centered text tabs under the glass header (design: For you | Following + compose) */}
      <View
        style={[
          styles.tabs,
          { top: headerInset, borderBottomColor: theme.backgroundElement },
        ]}>
        {TABS.map((t) => (
          <Pressable key={t.id} style={styles.tab} hitSlop={8} onPress={() => setType(t.id)}>
            <Text
              style={[
                styles.tabText,
                { color: type === t.id ? theme.text : theme.textSecondary },
                type === t.id && styles.tabActive,
              ]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
        <Pressable style={styles.tabPlus} hitSlop={8} onPress={compose}>
          <Plus size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Compose FAB (black circle, bottom-right per design) */}
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 76, backgroundColor: theme.text }]}
        onPress={compose}>
        <Plus size={26} color={theme.background} />
      </Pressable>

      <AppHeader wordmark />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { paddingTop: 120, alignItems: 'center' },
  footer: { paddingVertical: 24 },
  tabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    height: 44,
    borderBottomWidth: 1,
    zIndex: 30,
  },
  tab: { height: '100%', justifyContent: 'center' },
  tabText: { fontSize: 15, fontWeight: '500' },
  tabActive: { fontWeight: '800' },
  tabPlus: { position: 'absolute', right: 16 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 30,
  },
});
