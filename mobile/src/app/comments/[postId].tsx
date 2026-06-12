import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUp, Heart } from 'lucide-react-native';

import { BackArrowIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { compact, relativeTime } from '@/lib/format';
import { trpc } from '@/lib/trpc';

// Comments are posts with replyToId on the server, so rows look like
// (a subset of) post rows. Structural type, same rationale as PostCardData.
interface CommentRow {
  id: string;
  content: string | null;
  likes: number | null;
  isLiked: boolean;
  isPinned: boolean | null;
  isAuthor: boolean;
  createdAt: Date | string | null;
  user: { name: string | null; username: string | null; avatar_url: string | null } | null;
}

export default function CommentsScreen() {
  const theme = useTheme();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [draft, setDraft] = useState('');

  const comments = trpc.comment.getComments.useInfiniteQuery(
    { postId, limit: 30 },
    { getNextPageParam: (p) => p.nextCursor },
  );
  const utils = trpc.useUtils();
  const create = trpc.comment.createComment.useMutation({
    onSuccess: () => {
      utils.comment.getComments.invalidate({ postId });
      utils.content.getFeed.invalidate();
      setDraft('');
    },
  });

  const rows = (comments.data?.pages.flatMap((p) => p.comments) ?? []) as unknown as CommentRow[];

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.header, { borderBottomColor: theme.backgroundElement }]}>
            <Pressable hitSlop={12} onPress={() => router.back()}>
              <BackArrowIcon size={22} />
            </Pressable>
            <Text style={[styles.title, { color: theme.text }]}>Comments</Text>
            <View style={styles.headerSpacer} />
          </View>

          {comments.isPending ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(c) => c.id}
              contentContainerStyle={styles.list}
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                if (comments.hasNextPage && !comments.isFetchingNextPage) comments.fetchNextPage();
              }}
              renderItem={({ item }) => <Comment comment={item} postId={postId} />}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={{ color: theme.textSecondary }}>Be the first to comment.</Text>
                </View>
              }
              ListFooterComponent={
                comments.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null
              }
            />
          )}

          <View style={[styles.composer, { backgroundColor: theme.backgroundElement }]}>
            <TextInput
              style={[styles.composerInput, { color: theme.text }]}
              placeholder="Add a comment"
              placeholderTextColor={theme.textSecondary}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={1000}
            />
            <Pressable
              style={[styles.sendButton, (!draft.trim() || create.isPending) && styles.dim]}
              disabled={!draft.trim() || create.isPending}
              onPress={() => create.mutate({ postId, content: draft.trim() })}>
              {create.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ArrowUp size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Comment({ comment: c, postId }: { comment: CommentRow; postId: string }) {
  const theme = useTheme();
  const utils = trpc.useUtils();
  const toggleLike = trpc.comment.toggleCommentLike.useMutation({
    onSuccess: () => utils.comment.getComments.invalidate({ postId }),
  });

  return (
    <View style={styles.comment}>
      <Pressable
        disabled={!c.user?.username}
        onPress={() => router.push(`/profile/${c.user!.username}`)}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
          {c.user?.avatar_url && (
            <Image source={{ uri: c.user.avatar_url }} style={styles.fill} contentFit="cover" />
          )}
        </View>
      </Pressable>
      <View style={styles.flex}>
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          <Text style={[styles.name, { color: theme.text }]}>
            {c.user?.name ?? c.user?.username ?? 'Unknown'}
          </Text>
          {c.isAuthor ? '  ·  Creator' : ''}  ·  {relativeTime(c.createdAt)}
        </Text>
        {!!c.content && (
          <Text style={[styles.content, { color: theme.text }]}>{c.content}</Text>
        )}
      </View>
      <Pressable
        style={styles.likeCol}
        hitSlop={8}
        disabled={toggleLike.isPending}
        onPress={() => toggleLike.mutate({ commentId: c.id })}>
        <Heart
          size={16}
          color={c.isLiked ? '#ef4444' : theme.textSecondary}
          fill={c.isLiked ? '#ef4444' : 'transparent'}
        />
        <Text style={[styles.likeCount, { color: theme.textSecondary }]}>{compact(c.likes)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
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
  list: { paddingVertical: 8 },
  footer: { paddingVertical: 16 },
  comment: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  meta: { fontSize: 13 },
  name: { fontWeight: '700', fontSize: 14 },
  content: { fontSize: 15, lineHeight: 20, marginTop: 2 },
  likeCol: { alignItems: 'center', gap: 2, paddingTop: 2 },
  likeCount: { fontSize: 11 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  composerInput: { flex: 1, fontSize: 15, maxHeight: 110, paddingTop: 6, paddingBottom: 6 },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
