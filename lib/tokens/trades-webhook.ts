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
import { webhookIsCurrent } from "@/lib/helius/webhook-edit";

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
 * ## The unit is deliveries. The bill is credits. They are not proportional.
 *
 * Two measurements, each a clean 10-minute window against the admin API:
 *
 *     budget 12  ->  6.43 credits/min  ->  27.8% of a 1M/month plan   (ratio 0.54)
 *     budget 18  -> 16.20 credits/min  ->  70.0% of a 1M/month plan   (ratio 0.90)
 *
 * Raising the budget 1.5x raised the bill 2.5x. The ratio is not a constant, so
 * **do not extrapolate from one point** — I did exactly that, predicted 41.7% for
 * budget 18, and measured 70%.
 *
 * Why it bends: pools are chosen cheapest-first from an estimate
 * (`txns_24h / 1440`), and `txns_24h` is a 24-hour average. The quietest pools
 * are the ones whose recent activity most exceeds their daily mean, so each
 * increment of budget admits pools that overshoot their estimate by more than
 * the last. The estimate is systematically optimistic in the direction the
 * selection walks.
 *
 * ## So the only method that works is measure -> adjust -> measure
 *
 *     bun scripts/dev/helius-usage.mjs          # needs HELIUS_PROJECT_ID
 *
 * Take two readings ten minutes apart, divide, and compare against
 * `credits/min * 1440 * 30` = credits per month. Change ONE step at a time. A
 * free plan is 1,000,000/month; anything above ~40% has no room left for a
 * burst, and bursts are the whole reason this constant exists.
 *
 * ## Measured 2026-08-11, one day into the 08-10 → 09-10 cycle
 *
 * The default was 12 and nothing overrode it (the env var is unset in every
 * environment). That produced:
 *
 *     27.0 deliveries/min      (Cloudflare, 38,823 over 24h)
 *     37,637 credits/day       (Helius admin API, 97.5% of it webhooks)
 *     → 1,174,774 per cycle    = 117% of a 1,000,000 free plan
 *
 * Two constants in the old model were wrong, in opposite directions:
 *
 *   - credits per delivery is **0.97**, not the ~3 assumed. Helius bills a
 *     webhook delivery close to a single credit.
 *   - deliveries run **2.25x** the budget, not near 1x. That is the bend this
 *     comment already describes, measured: the estimate is `txns_24h / 1440`,
 *     a daily mean, and selection walks toward pools whose recent activity most
 *     exceeds their mean.
 *
 * ## This number now means what it says
 *
 * The 2.25x/2.67x gap moved into `ESTIMATE_INFLATION` in pool-budget.ts, which
 * divides the asked-for budget before spending it. So this is DELIVERIES PER
 * MINUTE as they actually arrive, and the affordability arithmetic can be
 * applied directly rather than guessed around:
 *
 *     1,000,000 credits ÷ 31 days ÷ 1440 min = 22.4 deliveries/min
 *     at 1 credit per delivery (helius.dev/docs/billing/plans)
 *
 * 15 leaves a third of the plan as headroom for bursts and for the RPC/DAS
 * share (currently 1.7%). It is also roughly what the old `6` was producing in
 * reality — 16.0/min measured — so this is a truthful re-labelling of the
 * status quo, not a traffic increase.
 *
 * ⚠️ RE-MEASURE after changing this, and fix ESTIMATE_INFLATION if the ratio
 * has moved: `bun scripts/dev/helius-usage.mjs` for credits, and
 * `node scripts/cf/zone-analytics.mjs --path /api/webhooks/helius-trades` for
 * the delivery rate. Two readings a full day apart, not ten minutes.
 */
// 16, against a free plan that sustains 23/min (1,000,000 / 30 / 1440).
//
// Was 15 and producing 3.5/min actual, because ESTIMATE_INFLATION was still
// calibrated for pool-watching under ANY — see the note there. With the factor
// corrected this number finally means what it says, and 16 leaves ~30% headroom
// for a burst, which is the entire reason a budget exists.
const BUDGET_PER_MIN = Math.max(0, Number(process.env.HELIUS_TRADES_BUDGET_PER_MIN ?? 16) || 0);

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
        .select({
            poolAddress: trendingCoins.poolAddress,
            tokenAddress: trendingCoins.tokenAddress,
            txns24h: trendingCoins.txns24h,
        })
        .from(trendingCoins)
        .where(eq(trendingCoins.network, "solana"));

    // WATCH THE COIN, NOT THE POOL.
    //
    // A pool is one venue; a token trades on many. Measured 2026-08-11 against
    // the two pools this webhook actually had registered, mint-side vs
    // pool-side over 100 transactions each:
    //
    //     C3Rfug…pump   100 SWAP both ways   pool saw 1 venue, mint saw 6
    //     DdSPvf…pump    62 SWAP both ways   pool saw 2 venues, mint saw 5
    //
    // Identical SWAP counts, so identical cost — the extra venues route through
    // the same pool. What the mint buys is everything that DOESN'T: a second
    // real pool, and the pool address CHANGING when a token graduates off its
    // bonding curve, which silently zeroes a pool-keyed tape until the next
    // hourly sync notices.
    //
    // The old objection ("watching the mint would also fire on plain
    // transfers") holds only under ANY. Under SWAP, Helius filters by parsed
    // type regardless of which address matched, so transfers never arrive —
    // measured at 6 TRANSFERs per 100 mint transactions, all of them filtered.
    //
    // Under ANY — i.e. once we have live tokens of our own — that filter is
    // gone and transfers would be billed, so the pool stays the unit there.
    const watch = mode === "SWAP" ? "token" : "pool";

    const selection = selectPoolsWithinBudget(candidates, {
        budgetPerMin: BUDGET_PER_MIN,
        mode,
        minTxns24h: MIN_POOL_TXNS_24H,
        watch,
    });
    const trending = selection.addresses.map((poolAddress) => ({ poolAddress }));
    console.log(
        `[trades-webhook] ${mode}: ${selection.addresses.length} display ${watch}(s), ` +
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

    // SKIP THE WRITE WHEN NOTHING CHANGED.
    //
    // Helius charges **100 credits per webhook edit** (helius.dev/docs/webhooks)
    // against 1 credit per delivery. This sync runs hourly across three
    // webhooks, so unconditional PUTs cost 25 x 3 x 100 = 7,500 credits/day —
    // 232,500 a month, or 23% of the free plan, to re-send a payload byte-for-
    // byte identical to the one already registered.
    //
    // The address set only moves when the trending board does, which is a few
    // times a day at most. Reads are not billed, so comparing first is free.
    if (existing && await webhookIsCurrent(apiKey, existing.webhookID, accountAddresses, [mode])) {
        console.log(`[trades-webhook] ${accountAddresses.length} address(es) unchanged — no edit, no 100-credit charge`);
        return { webhookID: existing.webhookID, watching: accountAddresses.length, created: false };
    }

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
