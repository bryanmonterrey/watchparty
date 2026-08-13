// Keep the Tape DO watching the coins that currently matter.
//
// The socket holds up to 50 tokens (Mobula's per-organisation cap) and the
// right 50 change constantly — a coin that mattered this morning is dead by
// lunch. Without this the DO would stream whatever it was seeded with, forever,
// and the tape would slowly become a record of yesterday.
//
// ## Re-subscribing is FREE, which is what makes a live list affordable
//
// Mobula bills a socket at 1 credit per MINUTE OPEN, not per subscription and
// not per message. `Tape.reconcile()` sends a new `fast-trade` payload on the
// EXISTING connection rather than reconnecting — so changing all 50 coins costs
// exactly nothing, and could run every minute if it needed to.
//
// That is the whole reason this design works where the Helius one did not:
// there, watching a coin cost per delivery, so the watch list had to be chosen
// cheapest-first and a coin was EVICTED as it took off. Here the list can be
// chosen by relevance, because relevance is free.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { trendingCoins } from "@/db/schema/content/trending";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { clearsBrandBar, isRiskyHoldings } from "@/lib/coin-feed/quality";
import { isVerifiedMint, verifiedSolanaMints } from "@/lib/coins/verified-tokens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Mobula's cap across eligible WebSocket payloads, per organisation. */
const MAX_WATCH = 50;

/** A board row older than this is not evidence of current activity. */
const FRESH_MS = 6 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const host = process.env.REALTIME_HOST ?? process.env.NEXT_PUBLIC_REALTIME_HOST;
    const secret = process.env.REALTIME_SECRET;
    if (!host || !secret) {
        // Not configured is not an error — the DO simply is not running yet.
        return NextResponse.json({ skipped: "realtime not configured" });
    }

    // ⚠️ OFF unless TAPE_WATCH_ENABLED=1, because Mobula's socket is gated by
    // PLAN, not by credits. Verified against the live endpoint 2026-08-12:
    //
    //   {"event":"error","message":"WebSocket usage is allowed only on Growth
    //    and Enterprise plans. Your current plan is 'free'. Please upgrade."}
    //
    // Growth is $400/month. Every earlier note in this codebase saying the Tape
    // DO needs the $50 Start-up tier was wrong — that reasoning came from credit
    // arithmetic (43,200/month fits inside 125,000) and never checked the plan
    // gate.
    //
    // Left running, this cron would set `active: true` every minute, the DO
    // would retry the rejected connection on its 20s alarm, and the failure
    // would be invisible from outside. Enable it the day the plan allows a
    // socket, not before.
    if (process.env.TAPE_WATCH_ENABLED !== "1") {
        return NextResponse.json({ skipped: "TAPE_WATCH_ENABLED not set (Mobula WS needs the Growth plan)" });
    }

    // Candidates: fresh board rows with a mint, busiest first.
    //
    // Ordered by 24h VOLUME rather than by cost, which is the inversion this
    // whole move was for. The Helius budget had to pick the CHEAPEST pools, so
    // it systematically watched the least interesting coins and dropped them
    // the moment they became interesting.
    const rows = await db
        .select({
            network: trendingCoins.network,
            tokenAddress: trendingCoins.tokenAddress,
            symbol: trendingCoins.symbol,
            name: trendingCoins.name,
            liquidityUsd: trendingCoins.liquidityUsd,
            top10Pct: trendingCoins.top10Pct,
            devPct: trendingCoins.devPct,
            snipersPct: trendingCoins.snipersPct,
            insidersPct: trendingCoins.insidersPct,
            bundlersPct: trendingCoins.bundlersPct,
        })
        .from(trendingCoins)
        .where(
            and(
                gte(trendingCoins.fetchedAt, new Date(Date.now() - FRESH_MS)),
                eq(trendingCoins.source, "mobula"),
                isNotNull(trendingCoins.tokenAddress),
            ),
        )
        .orderBy(desc(trendingCoins.volume24hUsd))
        .limit(MAX_WATCH * 4);

    // Apply the SAME gates the board applies. There is no point spending a
    // subscription slot streaming a coin the board refuses to show — and the
    // tape feeds the alert clusters, so a rug on the tape becomes a rug in
    // somebody's alerts.
    const verified = await verifiedSolanaMints();
    const items = rows
        .filter((r) => clearsBrandBar(r.symbol, r.name, r.liquidityUsd, isVerifiedMint(verified, r.network, r.tokenAddress), r.tokenAddress))
        .filter((r) => !isRiskyHoldings(r))
        .slice(0, MAX_WATCH)
        .map((r) => ({ blockchain: r.network, address: r.tokenAddress! }));

    // Empty means "watch nothing" and the DO parks its socket — correct, and
    // deliberately NOT the same as leaving a stale list running. A board that
    // has gone quiet should stop the meter, not keep streaming yesterday.
    // `https://` prepended, matching lib/realtime/publish.ts:43 — REALTIME_HOST
    // is stored BARE ("realtime.watchparty.xyz"), so building the URL from it
    // directly produces a relative fetch that fails on every call.
    const res = await fetch(`https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}/tape/watch`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: secret },
        body: JSON.stringify({ items, active: items.length > 0 }),
    });
    if (!res.ok) {
        return NextResponse.json(
            { error: `tape returned ${res.status}`, watching: items.length },
            { status: 502 },
        );
    }

    return NextResponse.json({ watching: items.length, considered: rows.length });
}
