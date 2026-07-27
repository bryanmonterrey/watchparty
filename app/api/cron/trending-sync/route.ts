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
        return NextResponse.json({ ...result, callsSpent: budget.spent });
    } catch (err) {
        console.error("[trending-sync] pass failed:", err);
        return NextResponse.json({ error: "sync failed" }, { status: 500 });
    }
}
