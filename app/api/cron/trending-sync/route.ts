// Trending board refresh — the writer behind /trending.
//
// Runs every minute on the existing "* * * * *" trigger, alongside token-sync
// and coin-alerts. Each pass refreshes a ROTATING SLICE of chains (see
// networksForPass) rather than the whole list, because GeckoTerminal's ~30
// calls/min ceiling is shared with the alert scan — a 20-chain sweep in one
// minute would 429 both. Four chains a minute turns the full list over every
// five minutes, which is well inside how fast a trending list actually moves.
import { NextRequest, NextResponse } from "next/server";
import { CallBudget, GT_TRENDING_BUDGET } from "@/lib/coin-feed/geckoterminal";
import { networksForPass, runTrendingSync, sourceForPass } from "@/lib/coin-feed/trending-sync";
import { TRENDING_NETWORKS } from "@/lib/coin-feed/networks";
import { runCandleSync, pruneCandles } from "@/lib/coins/candle-sync";
import { gtKeyed } from "@/lib/coins/gecko-endpoint";
import { MOBULA_TRENDING_CHAINS, syncTrendingChainFromMobula } from "@/lib/coin-feed/trending-mobula";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ?all=1 sweeps every chain in one go — for seeding the board by hand, not
    // for the schedule (it will burn the whole minute's quota and likely 429).
    const sweepAll = req.nextUrl.searchParams.get("all") === "1";
    const networks = sweepAll ? TRENDING_NETWORKS : networksForPass();
    const budget = new CallBudget(sweepAll ? TRENDING_NETWORKS.length : GT_TRENDING_BUDGET);

    // The schedule alternates top/trending by the clock; ?source= pins it, which
    // is what you want with ?all=1 when seeding the board by hand.
    const requested = req.nextUrl.searchParams.get("source");
    const source = requested === "top" || requested === "trending" ? requested : sourceForPass();

    // ── Mobula first, for the chains it serves ───────────────────────────────
    //
    // OFF unless TRENDING_MOBULA_CHAINS is set, so this deploys inert and the
    // GeckoTerminal path below is untouched until the switch is thrown
    // deliberately. Set it to a comma-separated list, or `*` for all six.
    //
    // Why move at all: GT rate-limits per IP and Cloudflare's egress IP is
    // shared, so it fails outright from the Worker (docs/market-data-options.md).
    // And it carries NO holder data, which is the only thing that can separate
    // an impersonator from a real brand product — `preOPENAI` and `CBETH` match
    // the same name rule. Mobula returns both, one call per chain.
    //
    // COST: 6 chains x 1 call. Hourly = 4,320/month (fits the 10k free tier);
    // every 5 min = 51,840 (fits the $50 tier). This route runs per MINUTE, so
    // a chain is refreshed only when its slice comes round — see the modulo in
    // `networksForPass`. Widen deliberately, and re-check the arithmetic first.
    const mobulaEnv = process.env.TRENDING_MOBULA_CHAINS?.trim();
    const mobulaChains = !mobulaEnv
        ? []
        : mobulaEnv === "*"
          ? [...MOBULA_TRENDING_CHAINS]
          : mobulaEnv.split(",").map((c) => c.trim()).filter((c) => (MOBULA_TRENDING_CHAINS as readonly string[]).includes(c));

    // ── The cost dial ────────────────────────────────────────────────────────
    //
    // This route fires EVERY MINUTE. Running six chains on every pass is
    // 259,200 credits/month, which fits neither the free tier (10k) nor the $50
    // one (125k) — so the cadence is not a preference, it is what decides
    // whether the bill is payable:
    //
    //     every 60 min   6 x 24   =  4,320/month  -> free tier
    //     every  5 min   6 x 288  = 51,840/month  -> $50 tier
    //     every  1 min   6 x 1440 = 259,200/month -> neither
    //
    // Expressed as an interval rather than a boolean precisely so moving up a
    // tier is one number, and so the arithmetic above sits next to the knob it
    // describes. `?all=1` bypasses it for a manual seed.
    const everyMin = Math.max(1, Number(process.env.TRENDING_MOBULA_EVERY_MIN ?? 60) || 60);
    const dueThisPass = sweepAll || new Date().getUTCMinutes() % everyMin === 0;

    const mobulaResults: { chain: string; written: number }[] = [];
    for (const chain of dueThisPass ? mobulaChains : []) {
        try {
            const r = await syncTrendingChainFromMobula(chain);
            // null = provider off or chain unsupported. Falling through to GT
            // rather than blanking the chain is the point of returning null.
            if (r) mobulaResults.push({ chain: r.chain, written: r.written });
        } catch (err) {
            console.error(`[trending-sync] mobula ${chain} failed:`, err instanceof Error ? err.message : err);
        }
    }
    // ── GeckoTerminal is OFF once Mobula is configured ───────────────────────
    //
    // Not "GT fills the chains Mobula doesn't serve". The owner's call, and the
    // measurements back it: GT ran a 23.5% HTTP 500 rate over a 6h window, it
    // fails outright from Cloudflare's shared egress IP
    // (docs/market-data-options.md), and it carries no holder data — so every
    // GT-sourced row is one the spam gate cannot judge. 217 of 503 rows were in
    // exactly that state: visible, unjudgeable, and indistinguishable from
    // "clean" to `isRiskyHoldings`, which fails open on nulls.
    //
    // A narrower board that can be filtered beats a wider one that cannot.
    //
    // Setting TRENDING_MOBULA_CHAINS is therefore the whole switch: GT keeps
    // running only while it is unset, which is what makes this reversible
    // without a deploy.
    const gtNetworks = mobulaChains.length > 0 ? [] : networks;

    try {
        const result = await runTrendingSync(budget, gtNetworks, source);

        // Candles take what the board's own sweep left. The board has first
        // claim: it's the front page, and a stale trending list is more visible
        // than a chart that advances a minute late. With a CoinGecko key the
        // ceiling is per-key rather than per-IP, so there's real headroom here;
        // without one this usually gets very little, which is exactly why the
        // chart READ path doesn't depend on it (see docs/live-charts-plan).
        const candleBudget = new CallBudget(gtKeyed() ? 40 : 4);
        const candles = await runCandleSync(candleBudget);

        // Retention runs on the pass that turns the chain list over, so it's
        // once every five minutes rather than every minute.
        const pruned = sweepAll || networks[0]?.id === TRENDING_NETWORKS[0]?.id
            ? await pruneCandles()
            : 0;

        return NextResponse.json({ ...result, mobula: mobulaResults, callsSpent: budget.spent, candles, pruned });
    } catch (err) {
        console.error("[trending-sync] pass failed:", err);
        return NextResponse.json({ error: "sync failed" }, { status: 500 });
    }
}
