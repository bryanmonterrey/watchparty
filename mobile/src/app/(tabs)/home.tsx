import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { AppHeader, useHeaderInset } from '@/components/app-header';
import { useTheme } from '@/hooks/use-theme';
import { trpc } from '@/lib/trpc';

// Mobile home, ported from components/home/mobile-home.tsx: stacked
// sections (Trending, IRL, Categories), each a horizontal snap row.

// Browse categories from components/home/video-feed/types.ts CATEGORIES,
// minus the feed-mode pseudo categories — keep in sync with the web list.
const BROWSE_CATEGORIES = [
  'Live', 'Just Chatting', 'Music', 'Esports', 'Creative', 'Tech', 'News',
  'Memes', 'Political', 'Games', 'IRL', 'GTAV', 'Sports', 'Fortnite', 'Pranks',
];

interface FeedVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  user: { username: string | null; avatar_url: string | null };
}

export default function HomeScreen() {
  const headerInset = useHeaderInset();

  const trending = trpc.content.getVideoFeed.useInfiniteQuery(
    { limit: 8 },
    { getNextPageParam: (p) => p.nextCursor },
  );
  const irl = trpc.content.getVideoFeed.useInfiniteQuery(
    { limit: 8, category: 'IRL' },
    { getNextPageParam: (p) => p.nextCursor },
  );

  const trendingVideos = trending.data?.pages.flatMap((p) => p.videos) ?? [];
  const irlVideos = irl.data?.pages.flatMap((p) => p.videos) ?? [];

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: headerInset + 16 }]}
        showsVerticalScrollIndicator={false}>
        <Section title="Trending">
          <VideoRow videos={trendingVideos} isLoading={trending.isLoading} />
        </Section>

        <Section title="IRL">
          <VideoRow videos={irlVideos} isLoading={irl.isLoading} />
        </Section>

        <Section title="Categories">
          <CategoryRow />
        </Section>
      </ScrollView>

      <AppHeader />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <Pressable hitSlop={8} onPress={() => router.push('/search')}>
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function VideoRow({ videos, isLoading }: { videos: FeedVideo[]; isLoading: boolean }) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <View style={styles.rowPadded}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.thumb, { backgroundColor: theme.backgroundElement }]} />
        ))}
      </View>
    );
  }
  if (videos.length === 0) {
    return (
      <Text style={[styles.empty, { color: theme.textSecondary }]}>Nothing here yet.</Text>
    );
  }
  return (
    <FlatList
      horizontal
      data={videos}
      keyExtractor={(v) => v.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
      snapToInterval={320 + 16}
      decelerationRate="fast"
      renderItem={({ item }) => <VideoCard video={item} />}
    />
  );
}

function VideoCard({ video }: { video: FeedVideo }) {
  const theme = useTheme();
  return (
    // TODO: push the video detail route once it's ported.
    <Pressable style={styles.card}>
      <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
        {video.thumbnailUrl && (
          <Image
            source={{ uri: video.thumbnailUrl }}
            style={styles.thumbImage}
            contentFit="cover"
            recyclingKey={video.id}
            transition={150}
          />
        )}
      </View>
      <View style={styles.cardMeta}>
        <View style={[styles.cardAvatar, { backgroundColor: theme.backgroundElement }]}>
          {video.user.avatar_url && (
            <Image source={{ uri: video.user.avatar_url }} style={styles.thumbImage} contentFit="cover" />
          )}
        </View>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
          {video.title}
        </Text>
      </View>
    </Pressable>
  );
}

function CategoryRow() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <FlatList
      horizontal
      data={BROWSE_CATEGORIES}
      keyExtractor={(c) => c}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.categoryCard, { backgroundColor: theme.backgroundElement }]}
          onPress={() => router.push('/search')}>
          <Text style={[styles.categoryLabel, { color: theme.text }]}>{item}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: 32, paddingBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sectionTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  viewAll: { fontSize: 14, fontWeight: '500', color: '#3b82f6' },
  rowContent: { paddingHorizontal: 20, gap: 16 },
  rowPadded: { flexDirection: 'row', gap: 16, paddingHorizontal: 20 },
  empty: { paddingHorizontal: 20, fontSize: 14 },
  card: { width: 320 },
  thumb: { width: 320, aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  cardMeta: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardAvatar: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden' },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  categoryCard: {
    width: 112,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    justifyContent: 'flex-end',
    padding: 8,
  },
  categoryLabel: { fontSize: 14, fontWeight: '700' },
});
