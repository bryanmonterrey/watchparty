import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera } from 'lucide-react-native';

import { BackArrowIcon } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { putToSignedUrl, storagePublicUrl } from '@/lib/upload';
import { trpc } from '@/lib/trpc';

// Settings v1: profile editing (web: components/profile/edit-profile-dialog)
// + sign out. Account/security/notification preferences come later.
export default function SettingsScreen() {
  const theme = useTheme();
  const { data: session } = authClient.useSession();
  const user = session?.user as
    | {
        id: string;
        name?: string | null;
        username?: string | null;
        bio?: string | null;
        avatar_url?: string | null;
        image?: string | null;
      }
    | undefined;

  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatar, setAvatar] = useState<{ uri: string; mime: string; filename: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presign = trpc.upload.getPresignedUrl.useMutation();
  const updateProfile = trpc.user.updateProfile.useMutation();
  const utils = trpc.useUtils();

  const avatarPreview = avatar?.uri ?? user?.avatar_url ?? user?.image ?? null;
  const canSave = name.trim().length > 0 && !busy;

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    const asset = result.assets?.[0];
    if (!asset) return;
    setAvatar({
      uri: asset.uri,
      mime: asset.mimeType ?? 'image/jpeg',
      filename: asset.fileName ?? `avatar-${Date.now()}.jpg`,
    });
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      let avatar_url: string | undefined;
      if (avatar) {
        const sanitized = avatar.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const { signedUrl, path } = await presign.mutateAsync({
          bucket: 'avatars',
          filename: sanitized,
          contentType: avatar.mime,
        });
        await putToSignedUrl(signedUrl, avatar.uri, avatar.mime);
        avatar_url = storagePublicUrl('avatars', path);
      }

      await updateProfile.mutateAsync({
        name: name.trim(),
        bio: bio.trim() || null,
        ...(avatar_url ? { avatar_url } : {}),
      });
      if (user?.username) utils.user.getProfile.invalidate({ username: user.username });
      // customSession hydrates avatar/bio — poke the store so useSession refreshes.
      (authClient as unknown as { $store: { notify: (s: string) => void } }).$store.notify(
        '$sessionSignal',
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'Sign out of Watchparty on this device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => authClient.signOut() },
    ]);
  }

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
            <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
            <Pressable hitSlop={8} disabled={!canSave} onPress={save}>
              {busy ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text style={[styles.save, { color: theme.text }, !canSave && styles.dim]}>
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Pressable style={styles.avatarWrap} onPress={pickAvatar}>
              <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
                {avatarPreview && (
                  <Image source={{ uri: avatarPreview }} style={styles.fill} contentFit="cover" />
                )}
              </View>
              <View style={styles.avatarBadge}>
                <Camera size={14} color="#fff" />
              </View>
            </Pressable>
            <Text style={[styles.username, { color: theme.textSecondary }]}>
              @{user?.username ?? 'username'}
            </Text>

            <Text style={[styles.label, { color: theme.textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
              value={name}
              onChangeText={setName}
              maxLength={50}
              placeholder="Your name"
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.label, { color: theme.textSecondary }]}>Bio</Text>
            <TextInput
              style={[
                styles.input,
                styles.bioInput,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
              value={bio}
              onChangeText={setBio}
              maxLength={160}
              multiline
              placeholder="Tell people about yourself"
              placeholderTextColor={theme.textSecondary}
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.signOut, { backgroundColor: theme.backgroundElement }]}
              onPress={confirmSignOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  save: { fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.4 },
  body: { padding: 20, paddingBottom: 40 },
  avatarWrap: { alignSelf: 'center' },
  avatar: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden' },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: { alignSelf: 'center', marginTop: 8, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 20, marginBottom: 6 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  error: { color: '#ef4444', fontSize: 13, marginTop: 12 },
  signOut: {
    marginTop: 32,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
});
