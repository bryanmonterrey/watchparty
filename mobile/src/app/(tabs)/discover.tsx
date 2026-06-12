import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const [type, setType] = useState<FeedType>('for-you');

  const feed = trpc.content.getFeed.useInfiniteQuery(
    { type, limit: 20 },
    { getNextPageParam: (p) => p.nextCursor },
  );

  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];

  return (
    <View style={styles.flex}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
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

      {/* Tab pills under the glass header */}
      <View style={[styles.tabs, { top: headerInset + 8 }]}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            style={[
              styles.tab,
              { backgroundColor: type === t.id ? theme.text : theme.backgroundElement },
            ]}
            onPress={() => setType(t.id)}>
            <Text
              style={[
                styles.tabText,
                { color: type === t.id ? theme.background : theme.textSecondary },
              ]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

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
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    zIndex: 30,
  },
  tab: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
});
