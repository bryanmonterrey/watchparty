import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackArrowIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { compact } from '@/lib/format';
import { trpc } from '@/lib/trpc';

// User profile (web: /[slug]) — banner, identity, follow, videos grid.
export default function ProfileScreen() {
  const theme = useTheme();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { data: session } = authClient.useSession();

  const profile = trpc.user.getProfile.useQuery({ username });
  const videos = trpc.content.getVideosByUser.useQuery(
    { userId: profile.data?.id ?? '', limit: 20 },
    { enabled: !!profile.data?.id },
  );

  const utils = trpc.useUtils();
  const follow = trpc.user.follow.useMutation({
    onSuccess: () => utils.user.getProfile.invalidate({ username }),
  });
  const unfollow = trpc.user.unfollow.useMutation({
    onSuccess: () => utils.user.getProfile.invalidate({ username }),
  });

  const p = profile.data;
  const isMe = !!p && p.id === session?.user.id;
  const followBusy = follow.isPending || unfollow.isPending;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      {profile.isPending ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : !p ? (
        <View style={styles.center}>
          <Text style={{ color: theme.textSecondary }}>This profile is unavailable.</Text>
        </View>
      ) : (
        <FlatList
          data={videos.data?.videos ?? []}
          keyExtractor={(v) => v.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              <View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
                {p.banner_url && (
                  <Image source={{ uri: p.banner_url }} style={styles.fill} contentFit="cover" />
                )}
              </View>

              <View style={styles.identity}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.background },
                  ]}>
                  {p.avatar_url && (
                    <Image source={{ uri: p.avatar_url }} style={styles.fill} contentFit="cover" />
                  )}
                </View>
                {!isMe && (
                  <Pressable
                    disabled={followBusy}
                    style={[
                      styles.followButton,
                      p.isFollowing
                        ? { backgroundColor: theme.backgroundElement }
                        : { backgroundColor: theme.text },
                      followBusy && styles.dim,
                    ]}
                    onPress={() =>
                      p.isFollowing
                        ? unfollow.mutate({ followingId: p.id })
                        : follow.mutate({ followingId: p.id })
                    }>
                    <Text
                      style={[
                        styles.followText,
                        { color: p.isFollowing ? theme.text : theme.background },
                      ]}>
                      {p.isFollowing ? 'Following' : 'Follow'}
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.meta}>
                <Text style={[styles.name, { color: theme.text }]}>{p.name ?? p.username}</Text>
                <Text style={[styles.username, { color: theme.textSecondary }]}>
                  @{p.username}
                </Text>
                {!!p.bio && <Text style={[styles.bio, { color: theme.text }]}>{p.bio}</Text>}
                <View style={styles.counts}>
                  <Text style={[styles.countText, { color: theme.textSecondary }]}>
                    <Text style={[styles.countNum, { color: theme.text }]}>
                      {compact(p.followersCount)}
                    </Text>{' '}
                    followers
                  </Text>
                  <Text style={[styles.countText, { color: theme.textSecondary }]}>
                    <Text style={[styles.countNum, { color: theme.text }]}>
                      {compact(p.followingCount)}
                    </Text>{' '}
                    following
                  </Text>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { color: theme.text }]}>Videos</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.videoCard} onPress={() => router.push(`/watch/${item.id}`)}>
              <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                {item.thumbnailUrl && (
                  <Image source={{ uri: item.thumbnailUrl }} style={styles.fill} contentFit="cover" />
                )}
              </View>
              <Text style={[styles.videoTitle, { color: theme.text }]} numberOfLines={2}>
                {item.title}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            videos.isPending ? (
              <ActivityIndicator style={styles.gridEmpty} />
            ) : (
              <Text style={[styles.gridEmpty, { color: theme.textSecondary }]}>No videos yet.</Text>
            )
          }
        />
      )}

      <SafeAreaView style={styles.backWrap} edges={['top']} pointerEvents="box-none">
        <Pressable style={styles.back} hitSlop={12} onPress={() => router.back()}>
          <BackArrowIcon size={22} />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backWrap: { position: 'absolute', top: 0, left: 0 },
  back: {
    margin: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: { width: '100%', aspectRatio: 3 / 1 },
  identity: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -36,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    overflow: 'hidden',
  },
  followButton: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followText: { fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.6 },
  meta: { paddingHorizontal: 16, paddingTop: 10, gap: 4 },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  username: { fontSize: 14 },
  bio: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  counts: { flexDirection: 'row', gap: 16, marginTop: 6 },
  countText: { fontSize: 14 },
  countNum: { fontWeight: '700' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
  },
  grid: { paddingBottom: 32 },
  gridRow: { paddingHorizontal: 16, gap: 12 },
  videoCard: { flex: 1, marginBottom: 14, gap: 6 },
  thumb: { aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden' },
  videoTitle: { fontSize: 13, fontWeight: '600' },
  gridEmpty: { paddingTop: 24, textAlign: 'center', width: '100%' },
});
