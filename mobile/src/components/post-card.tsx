import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Heart, MessageCircle, Repeat2, Eye, Play } from 'lucide-react-native';
import type { inferRouterOutputs } from '@trpc/server';

// Type-only import (see src/lib/trpc.ts) — never a value import.
import type { AppRouter } from '@/server/routers';
import { useTheme } from '@/hooks/use-theme';
import { trpc } from '@/lib/trpc';

export type FeedPost = inferRouterOutputs<AppRouter>['content']['getFeed']['posts'][number];

// v1 of the discover post card (web: components/browse/post-card). Renders
// author/text/image/video-thumb/counts with a working like toggle. Paywall,
// polls, link previews, reposts-with-quote and content warnings come later.
export function PostCard({ post }: { post: FeedPost }) {
  const theme = useTheme();
  const router = useRouter();
  const utils = trpc.useUtils();

  const toggleLike = trpc.content.toggleLike.useMutation({
    onSuccess: () => utils.content.getFeed.invalidate(),
  });

  const isRepost = !!post.repostOfId;
  const text = isRepost ? (post.origContent ?? post.content) : post.content;
  const image = isRepost ? (post.origImageUrl ?? post.imageUrl) : post.imageUrl;

  return (
    <View style={[styles.card, { borderBottomColor: theme.backgroundElement }]}>
      <View style={styles.authorRow}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
          {post.user?.avatar_url && (
            <Image source={{ uri: post.user.avatar_url }} style={styles.fill} contentFit="cover" />
          )}
        </View>
        <View style={styles.flex}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {post.user?.name ?? post.user?.username ?? 'Unknown'}
            {isRepost && <Text style={{ color: theme.textSecondary }}>  reposted</Text>}
          </Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
            @{post.user?.username ?? 'unknown'} · {relativeTime(post.createdAt)}
          </Text>
        </View>
      </View>

      {!!text && <Text style={[styles.content, { color: theme.text }]}>{text}</Text>}

      {post.videoUrl ? (
        <Pressable
          style={[styles.media, { backgroundColor: theme.backgroundElement }]}
          onPress={() => router.push(`/watch/${post.id}`)}>
          {post.videoThumbnailUrl && (
            <Image source={{ uri: post.videoThumbnailUrl }} style={styles.fill} contentFit="cover" />
          )}
          <View style={styles.playOverlay}>
            <Play size={28} color="#fff" fill="#fff" />
          </View>
        </Pressable>
      ) : image ? (
        <View style={[styles.media, { backgroundColor: theme.backgroundElement }]}>
          <Image source={{ uri: image }} style={styles.fill} contentFit="cover" />
        </View>
      ) : null}

      <View style={styles.counts}>
        <Pressable
          style={styles.count}
          hitSlop={8}
          disabled={toggleLike.isPending}
          onPress={() =>
            toggleLike.mutate({ postId: post.repostOfId ?? post.id, contentType: 'post' })
          }>
          <Heart
            size={18}
            color={post.isLiked ? '#ef4444' : theme.textSecondary}
            fill={post.isLiked ? '#ef4444' : 'transparent'}
          />
          <Text style={[styles.countText, { color: theme.textSecondary }]}>
            {compact(post.likes)}
          </Text>
        </Pressable>
        <View style={styles.count}>
          <MessageCircle size={18} color={theme.textSecondary} />
          <Text style={[styles.countText, { color: theme.textSecondary }]}>
            {compact(post.comments)}
          </Text>
        </View>
        <View style={styles.count}>
          <Repeat2 size={18} color={post.isReposted ? '#22c55e' : theme.textSecondary} />
          <Text style={[styles.countText, { color: theme.textSecondary }]}>
            {compact(post.reposts)}
          </Text>
        </View>
        <View style={styles.count}>
          <Eye size={18} color={theme.textSecondary} />
          <Text style={[styles.countText, { color: theme.textSecondary }]}>
            {compact(post.views)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function relativeTime(date: Date | string | null): string {
  if (!date) return '';
  const s = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function compact(n: number | null): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 14, gap: 10, borderBottomWidth: 1 },
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 1 },
  content: { fontSize: 15, lineHeight: 21 },
  media: { aspectRatio: 16 / 9, borderRadius: 12, overflow: 'hidden' },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  counts: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 2 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { fontSize: 13, fontWeight: '500' },
});
