import { withCache } from "@/lib/cache";
import {
    fetchMobulaChainPairs,
    fetchMobulaPulse,
    mobulaCadence,
    mobulaEnabled,
} from "@/lib/coins/mobula";
import { dropMeasuredUntradeable } from "@/server/lib/measured-liquidity";
import { pairToTradeToken, pulseLanesToTradeTokens } from "./pair-row";
import { sparkForRows, sparkKey } from "./spark";

/**
 * Chain-wide token board — every coin on the chain, DexScreener-style, from
 * Mobula's pairs endpoint (see docs/market-data-options.md for the provider
 * choice; GT from the Worker's shared egress IP is dead).
 *
 * "trending" is volume-ranked, "new" is Pulse's lifecycle lanes. Cached per
 * chain+list, so N viewers cost one upstream call per window — the credit
 * budget scales with cache windows, never with traffic. `enabled: false`
 * means MOBULA_API_KEY is unset and the board has no data source.
 *
 * Extracted from server/routers/trade.ts, which sits against the 1000-line
 * guard — the router keeps only input parsing; `chain` is already narrowed by
 * its zod enum there.
 */
export async function getChainFeed(chain: string, list: "trending" | "new") {
    try {
        // The liquidity filter runs OUTSIDE this cache, per request — see
        // below. The cached value is the RAW upstream list.
        const feed = await withCache(
            // v2: "new" became Pulse-backed (lifecycle lanes with real bonding
            // state) — the row semantics changed, so the old cached shape must
            // not serve alongside it. (Old v2 entries were written
            // pre-filtered; re-filtering them is a no-op, so the key survives
            // the filter moving out of the cache.)
            `trade:chainfeed:v2:${chain}:${list}`,
            mobulaCadence().chainFeedTtl,
            async () => {
                // Hard 10s lid ON TOP of the fetch's own AbortSignal —
                // observed on prod (bnb, 2026-08-06): the upstream call hung
                // for minutes despite the 8s abort, and a request that never
                // resolves is worse than an empty answer.
                const lid = <T,>(p: Promise<T>): Promise<T> =>
                    Promise.race([
                        p,
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error("chain feed upstream timeout")), 10_000)
                        ),
                    ]);

                // ── "new" is Pulse-backed ────────────────────────────────────
                //
                // The pairs endpoint is pool-shaped: a pump.fun coin has no
                // pool until it migrates, so its "newest" list is a MIGRATIONS
                // feed — measured 2026-08-13, all 40 of solana's newest rows
                // were post-migration pools. Pulse serves the lanes the
                // memescope actually draws: on-curve coins with real
                // bondingPercentage.
                if (list === "new") {
                    const lanes = await lid(fetchMobulaPulse(chain, 50));
                    if (lanes) {
                        return {
                            enabled: mobulaEnabled(),
                            tokens: pulseLanesToTradeTokens(chain, lanes),
                        };
                    }
                    // null = Pulse can't serve this chain — fall through to
                    // the newest-pairs list rather than going dark.
                }

                // null = provider off / chain unsupported — a real, cacheable
                // answer, unlike a failure.
                const rows = await lid(
                    fetchMobulaChainPairs(chain, list, list === "new" ? 50 : 100),
                );
                let mapped = (rows ?? []).map((p) => pairToTradeToken(chain, p));

                // Robinhood's pairs endpoint 500s (mapped as absent), so its
                // trending board is the Pulse bonded lane, volume-sorted —
                // same rows a pairs feed would carry.
                if (!rows && list === "trending") {
                    const lanes = await lid(fetchMobulaPulse(chain, 100)).catch(() => null);
                    if (lanes) {
                        mapped = [...lanes.bonded]
                            .sort((a, b) => b.volume24h - a.volume24h)
                            .map((p) => pairToTradeToken(chain, p, "bonded"));
                    }
                }

                return { enabled: mobulaEnabled(), tokens: mapped };
            }
        );

        // This board is a live passthrough and carries no liquidity of its
        // own, so the floor /trending applies in SQL has to come from what we
        // already measured (server/lib/measured-liquidity).
        //
        // PER REQUEST, outside the cache — deliberately, since HAT
        // (2026-08-20): the filter fails open on a transient DB error, and
        // when it ran inside the cache callback that unfiltered list was
        // CACHED, pinning a measured $0.60 rug to the board for a full
        // 5-minute window per blip. Out here a blip degrades exactly one
        // response, the next request filters again, and a coin vanishes the
        // moment it is measured instead of at the next cache fill. Cost: one
        // indexed IN-query per request.
        const tradeable = await dropMeasuredUntradeable(chain, feed.tokens);
        // Bars for whatever of these the tape has seen — one read, outside the
        // cache for the same reason the liquidity filter is (a stale chart is
        // worse than a missing one, and this way a blip costs one response).
        const spark = await sparkForRows(tradeable);
        return {
            enabled: feed.enabled,
            tokens: tradeable.map((t) => ({ ...t, spark: spark.get(sparkKey(t)) ?? [] })),
        };
    } catch {
        // Upstream failure (timeout, 429 on the free key's 1 RPS when several
        // chains fan out together): answer empty but DON'T cache it — the old
        // catch-inside-the-cache turned one 429 into five minutes of empty
        // board for that chain.
        return { enabled: mobulaEnabled(), tokens: [] };
    }
}
