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
import { selectPoolsWithinBudget } from "./pool-budget";

const MAX_ADDRESSES = 90_000; // Helius caps 100k/webhook; headroom before sharding

/**
 * Deliveries per minute the trades webhook may cost — the knob that replaced
 * `MAX_DISPLAY_POOLS`.
 *
 * A COUNT was the wrong unit. Pool cost varies by three orders of magnitude:
 * HOOD at 230,975 txns/day is 850 deliveries/min on its own, while TROLL at
 * 1,435/day is 1/min. "15 pools" meant anything from comfortable to 109x over,
 * depending on what happened to be trending — which is exactly how a 1M/month
 * plan went in 1.5 days.
 *
 * A free plan is 1M/month = **23 deliveries/min** in total. 12 leaves room for
 * the assets and user-trades webhooks and for the estimate being an estimate;
 * `txns_24h` is a 24-hour average and real activity is bursty.
 *
 * Raise it with `HELIUS_TRADES_BUDGET_PER_MIN` on a bigger plan. The selection
 * adapts on its own — more budget simply admits more pools, cheapest first.
 */
const BUDGET_PER_MIN = Math.max(0, Number(process.env.HELIUS_TRADES_BUDGET_PER_MIN ?? 12) || 0);

/**
 * A pool quieter than this is watched for nothing: it never accumulates the
 * ~40 trades `traderConcentration` needs before it will return a verdict, so it
 * spends budget producing samples too small to score.
 */
const MIN_POOL_TXNS_24H = Math.max(0, Number(process.env.HELIUS_TRADES_MIN_TXNS ?? 500) || 0);

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
    // ONE transactionTypes per webhook, so the mode is whole-list. ANY is only
    // needed for OUR pools — Helius's enhanced parser doesn't classify Meteora
    // DBC curve swaps as SWAP — and it costs a measured 5.3x, because it fires
    // on every transaction touching a pool rather than just swaps. With no pools
    // of our own, SWAP is exact for ordinary AMM pairs and buys ~5x more display
    // pools for the same spend.
    const mode: "ANY" | "SWAP" = rows.length > 0 ? "ANY" : "SWAP";

    // Chosen by BUDGET, cheapest first — see lib/tokens/pool-budget.ts. Ordering
    // by rank is what broke this: rank is activity, so it selected the single
    // most expensive pools on the chain and nothing else fit.
    const candidates = await db
        .select({ poolAddress: trendingCoins.poolAddress, txns24h: trendingCoins.txns24h })
        .from(trendingCoins)
        .where(eq(trendingCoins.network, "solana"));

    const selection = selectPoolsWithinBudget(candidates, {
        budgetPerMin: BUDGET_PER_MIN,
        mode,
        minTxns24h: MIN_POOL_TXNS_24H,
    });
    const trending = selection.addresses.map((poolAddress) => ({ poolAddress }));
    console.log(
        `[trades-webhook] ${mode}: ${selection.addresses.length} display pool(s), ` +
        `~${selection.estPerMin.toFixed(1)}/min of ${BUDGET_PER_MIN} budget ` +
        `(${selection.tooQuiet} too quiet, ${selection.tooBusy} didn't fit)`,
    );

    const accountAddresses = [
        ...new Set([...rows, ...trending].map((r) => r.poolAddress).filter(Boolean) as string[]),
    ].slice(0, MAX_ADDRESSES);

    const list = await (await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`)).json();
    const existing = Array.isArray(list)
        ? list.find((w: { webhookURL?: string }) => w.webhookURL === webhookURL)
        : null;

    // Nothing to watch. Returning here USED to be right — it meant "nothing
    // launched yet" — and it is a trap now that display pools default to 0: an
    // early return leaves whatever is already registered in place, so the wide
    // 15-trending-pool config would survive forever in exactly the case this
    // cap exists to prevent.
    //
    // Helius rejects an empty address list, so the way to say "watch nothing"
    // is to keep exactly one address. Same trick as
    // `scripts/shrink-trades-webhook.mjs`, and it keeps the webhook alive to be
    // re-widened later.
    if (!accountAddresses.length) {
        if (!existing) return { webhookID: "", watching: 0, created: false };

        // The LIST response omits accountAddresses — every webhook comes back
        // looking like it watches 0, which is how the shrink script once
        // believed the flood was already stopped. Fetch by ID for the real list.
        const hook = await (
            await fetch(`https://api.helius.xyz/v0/webhooks/${existing.webhookID}?api-key=${apiKey}`)
        ).json();
        const keep = (hook.accountAddresses ?? []).slice(0, 1);
        if (!keep.length) return { webhookID: existing.webhookID, watching: 0, created: false };

        const res = await fetch(`https://api.helius.xyz/v0/webhooks/${existing.webhookID}?api-key=${apiKey}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                webhookURL,
                transactionTypes: [mode],
                accountAddresses: keep,
                webhookType: "enhanced",
                ...(process.env.HELIUS_WEBHOOK_SECRET ? { authHeader: process.env.HELIUS_WEBHOOK_SECRET } : {}),
            }),
        });
        if (!res.ok) throw new Error(`Helius API error: ${JSON.stringify(await res.json())}`);
        return { webhookID: existing.webhookID, watching: keep.length, created: false };
    }

    // ANY (not SWAP): Helius's enhanced parser doesn't classify Meteora DBC
    // curve swaps as SWAP; any tx touching a pool is trade-relevant anyway,
    // and the receiver throttles per token.
    //
    // ⚠️ THIS IS THE OTHER HALF OF THE 2026-08-09 CREDIT BURN. Measured:
    //
    //   the 15 registered pools     ~687,880 swaps/day  =    478 deliveries/min
    //   actually delivered                                 2,518 deliveries/min
    //
    // A 5.3x multiplier, because ANY fires on EVERY transaction touching a
    // watched pool — liquidity ops, transfers, failed transactions — not just
    // the swaps the receiver cares about. Combined with watching the busiest
    // pools on Solana (rank 1 was HOOD at 222,914 txns/day on its own), that is
    // 3.47M delivery attempts in 23 hours against a 1M/month plan.
    //
    // ANY is still correct for OUR pools: Meteora DBC curve swaps genuinely
    // aren't classified as SWAP, and a launch we own is low-volume. It is wrong
    // for display pools, which are ordinary AMM pairs where SWAP works fine.
    //
    // A Helius webhook carries ONE transactionTypes for all its addresses, so
    // the two cannot be mixed — separating them means a second webhook. Until
    // that exists, re-widening HELIUS_TRADES_DISPLAY_POOLS re-creates the burn
    // at roughly 5x whatever the raw swap rate of those pools is. Do not raise
    // it without splitting the webhook first.
    const payload = {
        webhookURL,
        transactionTypes: [mode],
        accountAddresses,
        webhookType: "enhanced",
        ...(process.env.HELIUS_WEBHOOK_SECRET ? { authHeader: process.env.HELIUS_WEBHOOK_SECRET } : {}),
    };

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
