import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heart } from 'lucide-react-native';

import type { inferRouterOutputs } from '@trpc/server';

import { BackArrowIcon } from '@/components/icons';
// Type-only import (see src/lib/trpc.ts) — never a value import.
import type { AppRouter } from '@/server/routers';
import { trpc } from '@/lib/trpc';

// VOD watch screen — mobile take on components/video/video-watch-page.tsx.
// Always dark (video context). Live streams (.../live) come later with IVS.

export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const video = trpc.content.getVideoById.useQuery({ postId: id });

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {video.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : !video.data ? (
          <View style={styles.center}>
            <Text style={styles.muted}>This video is unavailable.</Text>
          </View>
        ) : (
          <Player video={video.data} />
        )}

        <Pressable style={styles.back} hitSlop={12} onPress={() => router.back()}>
          <BackArrowIcon />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

type VideoData = NonNullable<
  inferRouterOutputs<AppRouter>['content']['getVideoById']
>;

function Player({ video }: { video: VideoData }) {
  const player = useVideoPlayer(video.videoUrl, (p) => {
    p.play();
  });

  const utils = trpc.useUtils();
  const toggleLike = trpc.content.toggleLike.useMutation({
    onSuccess: () => utils.content.getVideoById.invalidate({ postId: video.id }),
  });

  const views = video.views ?? 0;
  const likes = video.likes ?? 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
      <VideoView
        player={player}
        style={styles.video}
        fullscreenOptions={{ enable: true }}
        contentFit="contain"
      />

      <View style={styles.meta}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.stats}>
          {views.toLocaleString()} views ·{' '}
          {video.createdAt ? new Date(video.createdAt).toLocaleDateString() : ''}
        </Text>

        <View style={styles.authorRow}>
          <Pressable
            style={[styles.authorRow, styles.flex]}
            disabled={!video.author.username}
            onPress={() => router.push(`/profile/${video.author.username}`)}>
            <View style={styles.avatar}>
              {video.author.avatar_url && (
                <Image source={{ uri: video.author.avatar_url }} style={styles.avatarImage} contentFit="cover" />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={styles.authorName} numberOfLines={1}>
                {video.author.name ?? video.author.username ?? 'Unknown'}
              </Text>
              <Text style={styles.muted}>
                {Number(video.author.followerCount ?? 0).toLocaleString()} followers
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.likeButton}
            disabled={toggleLike.isPending}
            onPress={() => toggleLike.mutate({ postId: video.id, contentType: 'video' })}>
            <Heart
              size={20}
              color={video.isLiked ? '#ef4444' : '#fff'}
              fill={video.isLiked ? '#ef4444' : 'transparent'}
            />
            <Text style={styles.likeCount}>{likes.toLocaleString()}</Text>
          </Pressable>
        </View>

        {!!video.content && <Text style={styles.description}>{video.content}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 16, top: 60, zIndex: 10, padding: 8 },
  body: { paddingBottom: 32 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', marginTop: 44 },
  meta: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  title: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  stats: { color: '#a1a1aa', fontSize: 13 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#212225',
  },
  avatarImage: { width: '100%', height: '100%' },
  authorName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  muted: { color: '#a1a1aa', fontSize: 13 },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(106,106,106,0.35)',
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
  },
  likeCount: { color: '#fff', fontSize: 14, fontWeight: '600' },
  description: { color: '#d4d4d8', fontSize: 14, lineHeight: 21, marginTop: 6 },
});
