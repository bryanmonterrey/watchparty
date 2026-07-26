import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { Heart, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { PinkStarLogo } from '@/components/icons';
import { useTheme } from '@/hooks/use-theme';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export const HEADER_HEIGHT = 64;

/**
 * Mobile top chrome, ported from components/app-ui/mobile/mobile-header.tsx.
 * Variants match the web: home/search → logo chip left; messages/trade →
 * big page title; discover → centered wordmark. Liquid Glass surface on
 * iOS 26 (the web used backdrop-blur), translucent fallback elsewhere.
 */
export function AppHeader({ title, wordmark }: { title?: string; wordmark?: boolean }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const content = (
    <View style={[styles.row, { height: HEADER_HEIGHT }]}>
      {title ? (
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      ) : wordmark ? (
        <View />
      ) : (
        <PinkStarLogo size={26} />
      )}

      {wordmark && (
        <Text style={[styles.wordmark, { color: theme.text }]} pointerEvents="none">
          watchparty
        </Text>
      )}

      <HeaderActions />
    </View>
  );

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView style={[styles.header, { paddingTop: insets.top }]} glassEffectStyle="regular">
        {content}
      </GlassView>
    );
  }
  return (
    <View style={[styles.header, styles.fallback, { paddingTop: insets.top }]}>{content}</View>
  );
}

function HeaderActions() {
  const theme = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user as
    | { avatar_url?: string | null; image?: string | null; name?: string | null; email?: string }
    | undefined;
  const avatar = user?.avatar_url ?? user?.image ?? null;
  const unread = trpc.notification.getUnreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  function onAvatarPress() {
    router.push('/settings');
  }

  return (
    <View style={styles.actions}>
      <Pressable hitSlop={8} onPress={() => router.push('/compose')}>
        <Plus size={28} color={theme.text} />
      </Pressable>
      <Pressable hitSlop={8} onPress={() => router.push('/notifications')}>
        <View>
          <Heart size={26} color={theme.text} />
          {!!unread.data?.count && <View style={styles.dot} />}
        </View>
      </Pressable>
      <Pressable hitSlop={8} onPress={onAvatarPress}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <Text style={[styles.avatarInitial, { color: theme.textSecondary }]}>
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

/** Convenience: top padding screens need so content clears the header. */
export function useHeaderInset(): number {
  const insets = useSafeAreaInsets();
  return insets.top + HEADER_HEIGHT;
}

export function HeaderSpacer() {
  return <View style={{ height: useHeaderInset() }} />;
}

const styles = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40 },
  fallback: { backgroundColor: 'rgba(0,0,0,0.6)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  wordmark: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 12, fontWeight: '700' },
});
