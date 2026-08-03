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

    try {
        const result = await runTrendingSync(budget, networks, source);

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

        return NextResponse.json({ ...result, callsSpent: budget.spent, candles, pruned });
    } catch (err) {
        console.error("[trending-sync] pass failed:", err);
        return NextResponse.json({ error: "sync failed" }, { status: 500 });
    }
}
