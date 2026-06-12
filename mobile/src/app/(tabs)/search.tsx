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
import { trpc } from '@/lib/trpc';

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
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Search for posts, people, and more.
          </Text>
        </View>
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
});
