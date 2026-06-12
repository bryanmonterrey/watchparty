import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { authClient } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

/**
 * Placeholder home screen proving the full stack: better-auth session from
 * SecureStore + a typed tRPC query against the Next.js server.
 */
export default function HomeScreen() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!session) {
    return <Redirect href="/" />;
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ThemedView style={styles.container}>
          <ThemedText type="subtitle">
            Hey {session.user.name || session.user.email}
          </ThemedText>
          <FollowCounts userId={session.user.id} />
          <Pressable style={styles.signOut} onPress={() => authClient.signOut()}>
            <ThemedText type="link" themeColor="textSecondary">
              Sign out
            </ThemedText>
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

function FollowCounts({ userId }: { userId: string }) {
  const counts = trpc.user.followCounts.useQuery({ userId });

  if (counts.isPending) return <ActivityIndicator />;
  if (counts.error) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        tRPC error: {counts.error.message}
      </ThemedText>
    );
  }

  return (
    <ThemedText themeColor="textSecondary">
      {counts.data.followers} followers · {counts.data.following} following
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.three,
  },
  signOut: { marginTop: 'auto', marginBottom: Spacing.four },
});
