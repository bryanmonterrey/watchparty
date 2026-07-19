import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { callouts, pnlSnapshots, weeklyFinishes } from "@/db/schema/content";
import { user } from "@/db/schema/auth/user";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

// Snapshots the weekly Top Caller / Top Trader finishes into weekly_finishes
// (docs/design-brief-2026-07.md §1). The live boards are rolling 7d windows,
// so this must run right as the ISO week rolls: the worker hits this route on
// the */10 slot every 10 min, and it no-ops unless we're inside Monday
// 00:00–01:00 UTC (6 retry chances) with the just-ended week not yet written.
// Idempotent per (board, isoWeek) — re-runs inside the window are safe.

const TOP_N = 20;
const PER_CALL_GAIN_CAP = 10; // keep in sync with callout.leaderboard

/** ISO-8601 week key, e.g. "2026-W29". */
function isoWeekKey(d: Date): string {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); // nearest Thursday
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const inWindow = now.getUTCDay() === 1 && now.getUTCHours() === 0;
    if (!inWindow) return NextResponse.json({ skipped: "outside Monday 00:00–01:00 UTC" });

    // The week that ended at this Monday 00:00 — key it by any moment last week.
    const isoWeek = isoWeekKey(new Date(now.getTime() - 3 * 86400000));
    const written: Record<string, number> = {};

    for (const board of ["caller", "trader"] as const) {
        const existing = await db
            .select({ id: weeklyFinishes.id })
            .from(weeklyFinishes)
            .where(and(eq(weeklyFinishes.board, board), eq(weeklyFinishes.isoWeek, isoWeek)))
            .limit(1);
        if (existing.length) { written[board] = 0; continue; }

        let rows: { userId: string; score: number }[];
        if (board === "caller") {
            const score = sql<number>`sum(least(${callouts.peakGainPct}, ${PER_CALL_GAIN_CAP}))`;
            rows = await db
                .select({ userId: callouts.userId, score })
                .from(callouts)
                .where(gte(callouts.createdAt, new Date(now.getTime() - 7 * 86400000)))
                .groupBy(callouts.userId)
                .orderBy(desc(score))
                .limit(TOP_N);
        } else {
            rows = (await db
                .select({ userId: pnlSnapshots.userId, score: pnlSnapshots.realizedUsd })
                .from(pnlSnapshots)
                .innerJoin(user, eq(pnlSnapshots.userId, user.id))
                .where(and(eq(pnlSnapshots.window, "7d"), eq(user.shareTrades, true)))
                .orderBy(desc(pnlSnapshots.realizedUsd))
                .limit(TOP_N));
        }

        if (rows.length) {
            await db.insert(weeklyFinishes)
                .values(rows.map((r, i) => ({
                    id: nanoid(),
                    userId: r.userId,
                    board,
                    isoWeek,
                    rank: i + 1,
                    score: r.score ?? 0,
                })))
                .onConflictDoNothing();
        }
        written[board] = rows.length;
    }

    return NextResponse.json({ isoWeek, written });
}
