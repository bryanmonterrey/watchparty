import { useEffect, useState } from 'react';
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
import { PostCard } from '@/components/post-card';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

// Browse categories (home shows the same rail) — keep in sync with
// components/home/video-feed/types.ts CATEGORIES.
const BROWSE_CATEGORIES = [
  'Live', 'Just Chatting', 'Music', 'Esports', 'Creative', 'Tech', 'News',
  'Memes', 'Political', 'Games', 'IRL', 'GTAV', 'Sports', 'Fortnite', 'Pranks',
];

const TABS = [
  { id: 'top', label: 'Top' },
  { id: 'latest', label: 'Latest' },
  { id: 'people', label: 'People' },
  { id: 'media', label: 'Media' },
] as const;

type Tab = (typeof TABS)[number]['id'];

// Search, ported from components/browse/search-results-view.tsx (minus
// Lists). Posts via content.searchPosts, people via user.search.
export default function SearchScreen() {
  const theme = useTheme();
  const headerInset = useHeaderInset();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('top');

  // Debounce typing → query.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const posts = trpc.content.searchPosts.useInfiniteQuery(
    { query, sort: tab === 'top' ? 'top' : 'latest', onlyMedia: tab === 'media' },
    {
      enabled: tab !== 'people' && query.length > 0,
      getNextPageParam: (p) => p.nextCursor,
    },
  );
  const users = trpc.user.search.useQuery(
    { query },
    { enabled: tab === 'people' && query.length > 0 },
  );

  const postRows = posts.data?.pages.flatMap((p) => p.posts) ?? [];
  const isLoading = tab === 'people' ? users.isLoading : posts.isLoading;

  return (
    <View style={styles.flex}>
      <View style={[styles.controls, { top: headerInset + 8 }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement }]}>
          <SearchIcon size={18} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search posts, people, categories"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            value={input}
            onChangeText={setInput}
          />
        </View>
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable
              key={t.id}
              style={[
                styles.tab,
                { backgroundColor: tab === t.id ? theme.text : theme.backgroundElement },
              ]}
              onPress={() => setTab(t.id)}>
              <Text
                style={[
                  styles.tabText,
                  { color: tab === t.id ? theme.background : theme.textSecondary },
                ]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!query ? (
        <BrowseLanding topInset={headerInset + 70} onPickCategory={setInput} />
      ) : isLoading ? (
        <View style={styles.empty}>
          <ActivityIndicator />
        </View>
      ) : tab === 'people' ? (
        <FlatList
          data={users.data?.users ?? []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingTop: headerInset + 116 }}
          renderItem={({ item }) => <UserRow user={item} />}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No people found.</Text>
          }
        />
      ) : (
        <FlatList
          data={postRows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingTop: headerInset + 116 }}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (posts.hasNextPage && !posts.isFetchingNextPage) posts.fetchNextPage();
          }}
          renderItem={({ item }) => <PostCard post={item} />}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No results.</Text>
          }
          ListFooterComponent={
            posts.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null
          }
        />
      )}

      <AppHeader />
    </View>
  );
}

// Pre-query landing from "Search Page mobile landing.svg": Following /
// Live / Categories sections. Following = accounts you follow; Live = the
// Live category of the video feed (web's streamer marquees are still
// placeholder skeletons, so these are the real equivalents).
function BrowseLanding({
  topInset,
  onPickCategory,
}: {
  topInset: number;
  onPickCategory: (c: string) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const following = trpc.user.getFollowing.useQuery(
    { userId: session?.user.id ?? '', limit: 12 },
    { enabled: !!session?.user.id },
  );
  const live = trpc.content.getVideoFeed.useInfiniteQuery(
    { limit: 8, category: 'Live' },
    { getNextPageParam: (p) => p.nextCursor },
  );
  const liveVideos = live.data?.pages.flatMap((p) => p.videos) ?? [];

  return (
    <FlatList
      data={[]}
      renderItem={() => null}
      contentContainerStyle={{ paddingTop: topInset, gap: 24, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={{ gap: 24 }}>
          <View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Following</Text>
            <FlatList
              horizontal
              data={following.data?.items ?? []}
              keyExtractor={(u) => u.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sectionRow}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.squareCard, { backgroundColor: theme.backgroundElement }]}
                  onPress={() => item.username && router.push(`/profile/${item.username}`)}>
                  <View style={styles.squareAvatar}>
                    {item.avatar_url && (
                      <Image source={{ uri: item.avatar_url }} style={styles.fill} contentFit="cover" />
                    )}
                  </View>
                  <Text style={[styles.squareName, { color: theme.text }]} numberOfLines={1}>
                    {item.name ?? item.username}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  {following.isPending ? '' : 'Follow creators to see them here.'}
                </Text>
              }
            />
          </View>

          <View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Live</Text>
            <FlatList
              horizontal
              data={liveVideos}
              keyExtractor={(v) => v.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sectionRow}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.squareCard, { backgroundColor: theme.backgroundElement }]}
                  onPress={() => router.push(`/watch/${item.id}`)}>
                  {item.thumbnailUrl && (
                    <Image source={{ uri: item.thumbnailUrl }} style={styles.fillAbs} contentFit="cover" />
                  )}
                  <View style={styles.squareAvatar}>
                    {item.user.avatar_url && (
                      <Image source={{ uri: item.user.avatar_url }} style={styles.fill} contentFit="cover" />
                    )}
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  {live.isPending ? '' : 'No live streams right now.'}
                </Text>
              }
            />
          </View>

          <View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Categories</Text>
            <FlatList
              horizontal
              data={BROWSE_CATEGORIES}
              keyExtractor={(c) => c}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sectionRow}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.categoryCard, { backgroundColor: theme.backgroundElement }]}
                  onPress={() => onPickCategory(item)}>
                  <Text style={[styles.categoryLabel, { color: theme.text }]}>{item}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      }
    />
  );
}

function UserRow({
  user,
}: {
  user: { id: string; name: string | null; username: string | null; avatar_url: string | null };
}) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      style={styles.userRow}
      disabled={!user.username}
      onPress={() => router.push(`/profile/${user.username}`)}>
      <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
        {user.avatar_url && (
          <Image source={{ uri: user.avatar_url }} style={styles.fill} contentFit="cover" />
        )}
      </View>
      <View>
        <Text style={[styles.userName, { color: theme.text }]}>{user.name ?? user.username}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>@{user.username}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  controls: { position: 'absolute', left: 16, right: 16, zIndex: 30, gap: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, height: '100%' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingTop: 16 },
  footer: { paddingVertical: 24 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  userName: { fontSize: 15, fontWeight: '600' },
  fillAbs: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sectionRow: { paddingHorizontal: 20, gap: 14 },
  squareCard: {
    width: 168,
    height: 168,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  squareAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  squareName: { fontSize: 13, fontWeight: '600', maxWidth: 140 },
  categoryCard: {
    width: 112,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    justifyContent: 'flex-end',
    padding: 8,
  },
  categoryLabel: { fontSize: 14, fontWeight: '700' },
});
