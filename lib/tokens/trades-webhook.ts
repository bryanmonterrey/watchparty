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
// Watched DISPLAY pools. Small on purpose — see the note at the query below;
// this bounds webhook DELIVERY RATE, which is what actually broke production.
const MAX_DISPLAY_POOLS = 15;

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
    const trending = await db
        .select({ poolAddress: trendingCoins.poolAddress })
        .from(trendingCoins)
        .where(eq(trendingCoins.network, "solana"))
        .orderBy(trendingCoins.rank)
        .limit(MAX_DISPLAY_POOLS);

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
