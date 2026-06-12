import { StyleSheet, Text, View } from 'react-native';

import { AppHeader, useHeaderInset } from '@/components/app-header';
import { useTheme } from '@/hooks/use-theme';

export default function SearchScreen() {
  const theme = useTheme();
  const headerInset = useHeaderInset();
  return (
    <View style={styles.flex}>
      <View style={[styles.body, { paddingTop: headerInset }]}>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Search is being ported from the web app.
        </Text>
      </View>
      <AppHeader />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  note: { fontSize: 15, textAlign: 'center' },
});
