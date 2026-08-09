// Helius webhook for token trades — the realtime rung above the minute sweep.
// Helius POSTs /api/webhooks/helius-trades whenever a watched POOL address is
// part of a transaction (every swap touches the pool; watching the mint would
// also fire on plain transfers). The receiver re-syncs that token's market
// row, and the tokens-table UPDATE fans out to clients over the existing
// Supabase realtime channel — external Jupiter/Photon trades show up in
// seconds, same as in-app ones.
//
// Registration is idempotent (keyed on webhook URL, like assets-webhook).
// Re-synced on token launch and by the daily cron.
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { trendingCoins } from "@/db/schema/content/trending";
import { eq, and, isNotNull } from "drizzle-orm";
import { heliusApiKey } from "@/lib/wallet/assets-webhook";

const MAX_ADDRESSES = 90_000; // Helius caps 100k/webhook; headroom before sharding
/**
 * Watched DISPLAY pools — the single biggest lever on the Helius bill.
 *
 * ## Why the default is 0
 *
 * 15 of them measured **2,055 deliveries/min** on 2026-08-09, and Helius bills
 * per delivery: 1,008,554 of a 1,000,000-credit monthly plan burned in ~1.5
 * days, 99.8% of it webhooks. When that plan runs out Helius answers
 * `max usage reached` to *everything on the key*, so `/api/rpc` 502s and every
 * browser on-chain read in the app breaks — which is what happened.
 *
 * The arithmetic is what forces this. Retries were a real problem (20.6% of
 * deliveries hung up as 499 and were redelivered) and the receiver now acks
 * before doing any work, but even at a **100% success rate** the current volume
 * is ~16x the monthly plan. Latency was never going to fix a volume problem.
 *
 * Pool COUNT is not the cost; pool ACTIVITY is. Ordering by rank picks
 * literally the busiest pools on Solana, so the top 15 is a firehose while the
 * tokens we launched are a trickle. Watching only our own pools is the one
 * setting guaranteed to fit inside the plan.
 *
 * ## What this trades away
 *
 * Coins we merely display lose their realtime tape and fall back to the cached
 * polling path — still correct, just seconds-scale instead of instant. Our own
 * launches are unaffected.
 *
 * Re-widen with `HELIUS_TRADES_DISPLAY_POOLS` once there's a paid plan to pay
 * for it. Raise it one step at a time and watch `bun scripts/dev/helius-usage.mjs`
 * — the burn is superlinear in rank, because rank *is* activity.
 */
const MAX_DISPLAY_POOLS = Math.max(0, Number(process.env.HELIUS_TRADES_DISPLAY_POOLS ?? 0) || 0);

export async function syncTradesWebhook(): Promise<{ webhookID: string; watching: number; created: boolean }> {
    const apiKey = heliusApiKey();
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_AUTH_URL;
    if (!base) throw new Error("Set NEXT_PUBLIC_BASE_URL to the prod domain.");
    const webhookURL = `${base.replace(/\/$/, "")}/api/webhooks/helius-trades`;

    const rows = await db
        .select({ poolAddress: tokens.poolAddress })
        .from(tokens)
        .where(and(eq(tokens.status, "live"), isNotNull(tokens.poolAddress)));

    // ALSO watch the coins we merely DISPLAY, so the live tape covers what
    // people actually open and not just tokens we launched.
    //
    // HARD CAP, learned the hard way. An earlier version registered every
    // trending + tracked Solana pool — 313 of them — and the receiver went to
    // ~32 requests per SECOND. Each delivery ran Drizzle queries against a
    // 15-connection pool, which exhausted it, threw "Worker exceeded memory
    // limit", and degraded unrelated parts of the site. Pool COUNT is not the
    // cost; pool ACTIVITY is, and trending pools are by definition the busiest
    // on the chain. The 90k address ceiling is irrelevant next to that.
    //
    // So: only the top of the board, ordered by rank. Anything below that is
    // served by the (still correct, still cached) polling path.
    // `.limit(0)` is a query that returns nothing but still costs a round trip,
    // and Drizzle is happy to build it — skip it outright when display pools are
    // switched off.
    const trending = MAX_DISPLAY_POOLS
        ? await db
              .select({ poolAddress: trendingCoins.poolAddress })
              .from(trendingCoins)
              .where(eq(trendingCoins.network, "solana"))
              .orderBy(trendingCoins.rank)
              .limit(MAX_DISPLAY_POOLS)
        : [];

    const accountAddresses = [
        ...new Set([...rows, ...trending].map((r) => r.poolAddress).filter(Boolean) as string[]),
    ].slice(0, MAX_ADDRESSES);
    if (!accountAddresses.length) {
        return { webhookID: "", watching: 0, created: false }; // nothing launched yet
    }

    // ANY (not SWAP): Helius's enhanced parser doesn't classify Meteora DBC
    // curve swaps as SWAP; any tx touching a pool is trade-relevant anyway,
    // and the receiver throttles per token.
    const payload = {
        webhookURL,
        transactionTypes: ["ANY"],
        accountAddresses,
        webhookType: "enhanced",
        ...(process.env.HELIUS_WEBHOOK_SECRET ? { authHeader: process.env.HELIUS_WEBHOOK_SECRET } : {}),
    };

    const list = await (await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`)).json();
    const existing = Array.isArray(list)
        ? list.find((w: { webhookURL?: string }) => w.webhookURL === webhookURL)
        : null;

    const res = existing
        ? await fetch(`https://api.helius.xyz/v0/webhooks/${existing.webhookID}?api-key=${apiKey}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
          })
        : await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
          });

    const out = await res.json();
    if (!res.ok) throw new Error(`Helius API error: ${JSON.stringify(out)}`);
    return { webhookID: out.webhookID, watching: accountAddresses.length, created: !existing };
}
