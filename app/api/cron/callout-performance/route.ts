import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { callouts } from "@/db/schema/content";
import { and, gte, sql } from "drizzle-orm";
import { awardXP } from "@/server/lib/xp";

// Advances peakGainPct for callouts inside the 7-day leaderboard window from
// the cached token prices (written by the token-stream worker — no RPC here),
// then pays the multiplier XP bonuses. Bonus awards are idempotent via the
// xp_events (userId, kind, refId=calloutId) unique index, so re-runs are safe.
// Called every 10 min by the cron worker (cron/src/index.ts).

const WINDOW = sql`now() - interval '7 days'`;

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // One set-based update: peak = max(peak, current/entry - 1).
    const updated = await db.execute(sql`
        UPDATE callouts c
        SET "peakGainPct" = t."priceUsd" / c."priceAtCall" - 1
        FROM tokens t
        WHERE t.id = c."tokenId"
          AND c."createdAt" > ${WINDOW}
          AND c."priceAtCall" > 0
          AND t."priceUsd" IS NOT NULL
          AND t."priceUsd" / c."priceAtCall" - 1 > c."peakGainPct"
        RETURNING c.id
    `);

    // Multiplier bonuses (2x = +100% gain, 5x = +400%, 10x = +900%).
    const candidates = await db
        .select({ id: callouts.id, userId: callouts.userId, peakGainPct: callouts.peakGainPct })
        .from(callouts)
        .where(and(gte(callouts.createdAt, sql`${WINDOW}`), gte(callouts.peakGainPct, 1)));

    let bonuses = 0;
    for (const c of candidates) {
        if (c.peakGainPct >= 1 && (await awardXP(c.userId, "callout_2x", c.id)).awarded) bonuses++;
        if (c.peakGainPct >= 4 && (await awardXP(c.userId, "callout_5x", c.id)).awarded) bonuses++;
        if (c.peakGainPct >= 9 && (await awardXP(c.userId, "callout_10x", c.id)).awarded) bonuses++;
    }

    return NextResponse.json({ updated: updated.length, candidates: candidates.length, bonuses });
}
