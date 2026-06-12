import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { ChevronDown, Eye, Settings, Users } from 'lucide-react-native';

import { AppHeader, useHeaderInset } from '@/components/app-header';
import { useTheme } from '@/hooks/use-theme';
import { compact } from '@/lib/format';
import { trpc } from '@/lib/trpc';

const PHASES = [
  { id: 'new', label: 'New' },
  { id: 'migrating', label: 'Migrating' },
  { id: 'migrated', label: 'Migrated' },
] as const;

type Phase = (typeof PHASES)[number]['id'];

// Trade screen from "public/mobile designs/Trade page mobile landing.svg":
// Trade heading + settings, phase selector ("New ▾") + Market Cap column
// label, token rows (image, name/ticker, age + holders/tx stats, chart
// button, mcap + 24h change). Reads trade.getFeed's cached market columns.
export default function TradeScreen() {
  const theme = useTheme();
  const headerInset = useHeaderInset();
  const [phase, setPhase] = useState<Phase>('new');
  const [pickerOpen, setPickerOpen] = useState(false);

  const feed = trpc.trade.getFeed.useQuery(undefined, { refetchInterval: 15_000 });
  const tokens = feed.data?.[phase] ?? [];

  return (
    <View style={styles.flex}>
      <FlatList
        data={tokens}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingTop: headerInset + 96 }}
        showsVerticalScrollIndicator={false}
        refreshing={feed.isRefetching}
        onRefresh={() => feed.refetch()}
        renderItem={({ item }) => <TokenRow token={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            {feed.isPending ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: theme.textSecondary }}>No {phase} tokens right now.</Text>
            )}
          </View>
        }
      />

      <View style={[styles.controls, { top: headerInset + 4 }]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]}>Trade</Text>
          <Settings size={22} color={theme.text} />
        </View>
        <View style={styles.filterRow}>
          <View>
            <Pressable
              style={[styles.phaseChip, { backgroundColor: theme.backgroundElement }]}
              onPress={() => setPickerOpen((o) => !o)}>
              <Text style={[styles.phaseText, { color: theme.text }]}>
                {PHASES.find((p) => p.id === phase)!.label}
              </Text>
              <ChevronDown size={16} color={theme.text} />
            </Pressable>
            {pickerOpen && (
              <View style={[styles.picker, { backgroundColor: theme.backgroundElement }]}>
                {PHASES.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.pickerItem}
                    onPress={() => {
                      setPhase(p.id);
                      setPickerOpen(false);
                    }}>
                    <Text
                      style={{
                        color: p.id === phase ? theme.text : theme.textSecondary,
                        fontWeight: p.id === phase ? '700' : '500',
                      }}>
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          <Text style={[styles.columnLabel, { color: theme.text }]}>Market Cap</Text>
        </View>
      </View>

      <AppHeader />
    </View>
  );
}

type TradeToken = {
  id: string;
  name: string;
  symbol: string | null;
  imageUrl: string;
  timeAgo: string;
  holderCount: number;
  txCount: number;
  bondingProgress: number;
  marketCap: number;
  changePercent: number;
};

function TokenRow({ token }: { token: TradeToken }) {
  const theme = useTheme();
  const up = token.changePercent >= 0;

  return (
    <View style={[styles.row, { borderBottomColor: theme.backgroundElement }]}>
      <View style={styles.tokenImageWrap}>
        <View style={[styles.tokenImage, { backgroundColor: theme.backgroundElement }]}>
          {!!token.imageUrl && (
            <Image source={{ uri: token.imageUrl }} style={styles.fill} contentFit="cover" />
          )}
        </View>
      </View>

      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={[styles.tokenName, { color: theme.text }]} numberOfLines={1}>
            {token.name}
          </Text>
          {!!token.symbol && (
            <Text style={[styles.ticker, { color: theme.textSecondary }]} numberOfLines={1}>
              {token.symbol}
            </Text>
          )}
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.age}>{token.timeAgo}</Text>
          <View style={styles.stat}>
            <Users size={13} color={theme.textSecondary} />
            <Text style={[styles.statText, { color: theme.textSecondary }]}>
              {compact(token.holderCount)}
            </Text>
          </View>
          <View style={styles.stat}>
            <Eye size={13} color={theme.textSecondary} />
            <Text style={[styles.statText, { color: theme.textSecondary }]}>
              {compact(token.txCount)}
            </Text>
          </View>
        </View>
      </View>

      {/* TODO: push the token chart screen once it's ported. */}
      <Pressable style={styles.chartButton}>
        <Text style={styles.chartText}>chart</Text>
      </Pressable>

      <View style={styles.mcapCol}>
        <Text style={[styles.mcap, { color: theme.text }]}>${compact(token.marketCap)}</Text>
        <Text style={[styles.change, { color: up ? '#16c784' : '#ef4444' }]}>
          {up ? '+' : ''}
          {token.changePercent.toFixed(3)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  controls: { position: 'absolute', left: 16, right: 16, zIndex: 30, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 40,
  },
  phaseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
  },
  phaseText: { fontSize: 14, fontWeight: '700' },
  picker: {
    position: 'absolute',
    top: 40,
    left: 0,
    borderRadius: 14,
    paddingVertical: 6,
    minWidth: 140,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  pickerItem: { paddingHorizontal: 14, paddingVertical: 9 },
  columnLabel: { fontSize: 13, fontWeight: '700' },
  empty: { paddingTop: 140, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tokenImageWrap: {
    borderWidth: 2,
    borderColor: '#16c784',
    borderRadius: 14,
    padding: 2,
  },
  tokenImage: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden' },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  tokenName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 },
  ticker: { fontSize: 13, fontWeight: '500' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  age: { fontSize: 13, fontWeight: '700', color: '#14b8a6' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 12 },
  chartButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#16c784',
    backgroundColor: 'rgba(22,199,132,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartText: { fontSize: 14, fontWeight: '600', color: '#0c8f5e' },
  mcapCol: { alignItems: 'flex-end', minWidth: 72 },
  mcap: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  change: { fontSize: 13, fontWeight: '700', marginTop: 2 },
});
