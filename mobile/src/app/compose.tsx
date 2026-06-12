import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ImageIcon, X } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

const MAX_LENGTH = 500;

interface PickedImage {
  uri: string;
  mime: string;
  filename: string;
}

// Post composer (web: components/browse/post-composer.tsx): text + one
// image v1. Upload mirrors the web path — upload.getPresignedUrl →
// Supabase signed-URL PUT → public URL. Polls/paywall/drafts later.
export default function ComposeScreen() {
  const theme = useTheme();
  const { data: session } = authClient.useSession();
  const user = session?.user as { avatar_url?: string | null; image?: string | null } | undefined;
  const avatar = user?.avatar_url ?? user?.image ?? null;

  const [text, setText] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const presign = trpc.upload.getPresignedUrl.useMutation();
  const create = trpc.content.createPost.useMutation();

  const canPost = (text.trim().length > 0 || !!image) && text.length <= MAX_LENGTH && !busy;

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!asset) return;
    setImage({
      uri: asset.uri,
      mime: asset.mimeType ?? 'image/jpeg',
      filename: asset.fileName ?? `photo-${Date.now()}.jpg`,
    });
  }

  async function post() {
    if (!canPost) return;
    setBusy(true);
    setError(null);
    try {
      let imageUrl: string | undefined;
      if (image) {
        const sanitized = image.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const { signedUrl, path } = await presign.mutateAsync({
          bucket: 'posts',
          filename: sanitized,
          contentType: image.mime,
        });
        const res = await FileSystem.uploadAsync(signedUrl, image.uri, {
          httpMethod: 'PUT',
          headers: { 'Content-Type': image.mime, 'x-upsert': 'false' },
        });
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`Image upload failed (${res.status}).`);
        }
        const supabaseUrl = (Constants.expoConfig?.extra as { supabaseUrl?: string })?.supabaseUrl;
        imageUrl = `${supabaseUrl}/storage/v1/object/public/posts/${path}`;
      }

      await create.mutateAsync({
        content: text.trim() || undefined,
        imageUrl,
        media: imageUrl ? [{ type: 'image', url: imageUrl }] : undefined,
      });
      utils.content.getFeed.invalidate();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}>
            <Pressable hitSlop={8} onPress={() => router.back()}>
              <Text style={[styles.cancel, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.postButton, { backgroundColor: theme.text }, !canPost && styles.dim]}
              disabled={!canPost}
              onPress={post}>
              {busy ? (
                <ActivityIndicator size="small" color={theme.background} />
              ) : (
                <Text style={[styles.postText, { color: theme.background }]}>Post</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.body}>
            <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
              {avatar && <Image source={{ uri: avatar }} style={styles.fill} contentFit="cover" />}
            </View>
            <View style={styles.flex}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="What's happening?"
                placeholderTextColor={theme.textSecondary}
                multiline
                autoFocus
                maxLength={MAX_LENGTH + 50}
                value={text}
                onChangeText={setText}
              />
              {image && (
                <View style={styles.preview}>
                  <Image source={{ uri: image.uri }} style={styles.previewImage} contentFit="cover" />
                  <Pressable style={styles.removeImage} hitSlop={8} onPress={() => setImage(null)}>
                    <X size={16} color="#fff" />
                  </Pressable>
                </View>
              )}
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable hitSlop={8} disabled={busy} onPress={pickImage}>
              <ImageIcon size={24} color={theme.textSecondary} />
            </Pressable>
            {error && <Text style={styles.error}>{error}</Text>}
            <Text
              style={[
                styles.counter,
                { color: text.length > MAX_LENGTH ? '#ef4444' : theme.textSecondary },
              ]}>
              {text.length}/{MAX_LENGTH}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancel: { fontSize: 16 },
  postButton: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  postText: { fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.4 },
  body: { flex: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  input: { fontSize: 17, lineHeight: 23, paddingTop: 8, maxHeight: 220 },
  preview: { marginTop: 12 },
  previewImage: { width: '100%', aspectRatio: 16 / 10, borderRadius: 14 },
  removeImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  error: { flex: 1, color: '#ef4444', fontSize: 13 },
  counter: { fontSize: 13, marginLeft: 'auto' },
});
