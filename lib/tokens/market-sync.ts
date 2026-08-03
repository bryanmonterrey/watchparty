// Shared market-data sync for launched tokens — the writer behind the cached
// market columns on `tokens`. Two callers:
//   - /api/cron/token-sync sweeps every launched token each minute
//   - trade.syncToken refreshes ONE token the moment someone swaps it in-app,
//     so in-app activity is visible immediately instead of on the next tick.
//
// Sources: GeckoTerminal multi-pool (price/mcap/volume + 5m/1h/6h/24h deltas,
// 24h tx count) and Meteora DBC on-chain state (bonding progress + migration —
// GT knows nothing about the curve).
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { eq } from "drizzle-orm";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";
import { maybePriceAlert, migrationAlert } from "@/lib/push/token-alerts";
import { emitMigrationEvent } from "@/lib/coin-feed/emit";

import { gtBase, gtHeaders } from "@/lib/coins/gecko-endpoint";

const GT = () => `${gtBase()}/networks/solana`;
const GT_HEADERS = { Accept: "application/json;version=20230302" };
const GT_BATCH = 30; // GT multi-pool cap

export type SyncableToken = {
    id: string;
    poolAddress: string;
    phase: "new" | "migrating" | "migrated";
    // Alert fields (web push) — callers select these so the sync passes can
    // fire price/migration notifications without extra reads.
    tokenAddress: string | null;
    name: string;
    ticker: string;
    lastAlertPriceUsd: number | null;
    lastAlertAt: Date | null;
};

type GtPool = {
    attributes?: {
        address?: string;
        base_token_price_usd?: string;
        market_cap_usd?: string | null;
        fdv_usd?: string | null;
        volume_usd?: Record<string, string>;
        price_change_percentage?: Record<string, string>;
        transactions?: { h24?: { buys?: number; sells?: number } };
    };
};

const num = (v: string | null | undefined): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** GeckoTerminal market data for a batch of tokens; returns rows updated. */
export async function syncMarketData(rows: SyncableToken[]): Promise<number> {
    const byPool = new Map(rows.map((r) => [r.poolAddress, r]));
    let synced = 0;
    for (let i = 0; i < rows.length; i += GT_BATCH) {
        const chunk = rows.slice(i, i + GT_BATCH);
        try {
            const res = await fetch(
                `${GT()}/pools/multi/${chunk.map((r) => r.poolAddress).join(",")}`,
                { headers: GT_HEADERS, signal: AbortSignal.timeout(10000) },
            );
            if (!res.ok) continue;
            const json = await res.json();
            const pools: GtPool[] = json.data ?? [];
            for (const pool of pools) {
                const a = pool.attributes;
                const row = a?.address ? byPool.get(a.address) : undefined;
                if (!a || !row) continue;
                await db.update(tokens).set({
                    priceUsd: num(a.base_token_price_usd),
                    marketCapUsd: num(a.market_cap_usd) ?? num(a.fdv_usd),
                    volume24hUsd: num(a.volume_usd?.h24),
                    volume1hUsd: num(a.volume_usd?.h1),
                    volume5mUsd: num(a.volume_usd?.m5),
                    priceChange24h: num(a.price_change_percentage?.h24),
                    priceChange6h: num(a.price_change_percentage?.h6),
                    priceChange1h: num(a.price_change_percentage?.h1),
                    priceChange5m: num(a.price_change_percentage?.m5),
                    txCount24h: (a.transactions?.h24?.buys ?? 0) + (a.transactions?.h24?.sells ?? 0),
                    lastSyncedAt: new Date(),
                }).where(eq(tokens.id, row.id));
                synced++;
                await maybePriceAlert(row, num(a.base_token_price_usd)).catch(() => {});
            }
        } catch {
            // one bad batch never kills the pass
        }
    }
    return synced;
}

/** Bonding-curve progress + migration flag for tokens still on the curve. */
export async function syncCurveProgress(rows: SyncableToken[]): Promise<number> {
    const onCurve = rows.filter((r) => r.phase !== "migrated");
    if (onCurve.length === 0) return 0;
    let curves = 0;
    try {
        const [{ DynamicBondingCurveClient }, { Connection }] = await Promise.all([
            import("@meteora-ag/dynamic-bonding-curve-sdk"),
            import("@solana/web3.js"),
        ]);
        const client = new DynamicBondingCurveClient(new Connection(getRpcUrl()), "confirmed");
        for (const row of onCurve) {
            try {
                const pool = await client.state.getPool(row.poolAddress);
                if (!pool) continue;
                // getPool wraps the account: { poolState: VirtualPool }
                const state = (pool as unknown as { poolState?: { isMigrated?: number } }).poolState
                    ?? (pool as unknown as { isMigrated?: number });
                const migrated = Number(state.isMigrated ?? 0) > 0;
                const ratio = migrated
                    ? 1
                    : await client.state.getPoolQuoteTokenCurveProgress(row.poolAddress);
                const progress = Math.min(100, Math.max(0, ratio * 100));
                const [after] = await db.update(tokens).set({
                    bondingProgress: progress,
                    phase: migrated ? "migrated" : progress >= 70 ? "migrating" : "new",
                }).where(eq(tokens.id, row.id))
                    // Only read back what the migration event needs; the write
                    // happens on every pass, the event only on the flip.
                    .returning({ imageUrl: tokens.imageUrl, marketCapUsd: tokens.marketCapUsd });
                curves++;
                if (migrated && row.phase !== "migrated") {
                    await migrationAlert(row).catch(() => {});
                    // Migration is a headline moment — put it in the /home
                    // coin alert rail too.
                    await emitMigrationEvent({
                        token: {
                            wpTokenId: row.id,
                            tokenAddress: row.tokenAddress,
                            ticker: row.ticker,
                            imageUrl: after?.imageUrl ?? null,
                            marketCapUsd: after?.marketCapUsd ?? null,
                        },
                    });
                }
            } catch {
                // pool read failures are per-token, not per-pass
            }
        }
    } catch (err) {
        console.error("curve sync failed:", err);
    }
    return curves;
}
