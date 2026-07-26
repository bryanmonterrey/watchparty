// Coin alert feed pass — the writer behind the /home left rail.
//
// Runs every minute on the existing "* * * * *" trigger (the Cloudflare cron
// floor), same slot as token-sync. One pass:
//   1. DISCOVERY (every DISCOVERY_EVERY_MIN minutes) — refresh which coins we
//      track: GeckoTerminal trending + new pools per enabled network, plus every
//      live watchparty launch, then prune the ones that went quiet.
//   2. CLUSTER SCAN — spend the rest of the pass's API budget pulling swaps for
//      the least-recently-scanned coins and emitting "N traders bought" events.
//
// The whole pass is bounded by ONE CallBudget (see lib/coin-feed/
// geckoterminal.ts) because GeckoTerminal's free tier is 30 calls/min and
// tripping the limiter 429s the rest of the minute. Discovery is deliberately
// first in line but capped, so it can never starve the scan.
import { NextRequest, NextResponse } from "next/server";
import { CallBudget, GT_CALL_BUDGET } from "@/lib/coin-feed/geckoterminal";
import { runDiscovery } from "@/lib/coin-feed/discovery";
import { runClusterScan } from "@/lib/coin-feed/clusters";
import { enabledNetworks } from "@/lib/coin-feed/networks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Discovery cadence in minutes. Trending pools don't turn over fast enough to
 *  justify paying 2 calls/network every single minute. */
const DISCOVERY_EVERY_MIN = 5;

export async function GET(req: NextRequest) {
    const authz = req.headers.get("authorization");
    if (authz !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const budget = new CallBudget(GT_CALL_BUDGET);
    const minute = new Date().getUTCMinutes();
    // ?discover=1 forces a discovery pass — used when validating by hand.
    const forceDiscovery = req.nextUrl.searchParams.get("discover") === "1";
    const shouldDiscover = forceDiscovery || minute % DISCOVERY_EVERY_MIN === 0;

    let discovery = null;
    if (shouldDiscover) {
        // Cap discovery at 2 calls per enabled network so a slow/looping
        // provider can't eat the scan's share of the budget.
        const cap = Math.min(budget.remaining, enabledNetworks().length * 2);
        const discoveryBudget = new CallBudget(cap);
        try {
            discovery = await runDiscovery(discoveryBudget);
        } catch (err) {
            console.error("[coin-alerts] discovery failed:", err);
        }
        // Charge what discovery actually spent against the pass budget.
        for (let i = 0; i < discoveryBudget.spent; i++) budget.take();
    }

    let scan = { scanned: 0, events: 0 };
    try {
        scan = await runClusterScan(budget);
    } catch (err) {
        console.error("[coin-alerts] cluster scan failed:", err);
    }

    return NextResponse.json({
        discovery,
        scanned: scan.scanned,
        events: scan.events,
        callsSpent: budget.spent,
    });
}
