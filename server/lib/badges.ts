import { db } from "@/db";
import { pnlSnapshots, predictionBets, questProgress, tokens, weeklyFinishes, xpEvents } from "@/db/schema/content";
import { user } from "@/db/schema/auth/user";
import { and, asc, desc, eq, gt, isNotNull, like, lt, lte, sql } from "drizzle-orm";
import { BADGE_CATALOG, EARLY_MEMBER_CUTOFF, levelBadgeId, type BadgeId, type EarnedBadge } from "@/lib/badges";

// Computes the earned-badge set for one user from tables that already exist
// (docs/design-brief-2026-07.md §1). Everything is derivable except weekly
// board finishes, which read the weekly_finishes snapshots. Callers cache the
// result (~5 min) via profile.card — never call this per-row in a list.

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function computeBadges(u: {
    id: string;
    level: number;
    createdAt: Date | null;
    shareTrades: boolean;
}): Promise<EarnedBadge[]> {
    const [finishes, sniper, wonBet, pnl30, launched, streakDays, signupsBefore] = await Promise.all([
        // Top-3 weekly finishes, both boards, earliest first for earnedAt.
        // Tolerates the table not existing yet (db/weekly-finishes-setup.sql is
        // applied by hand) — a missing table must not 500 every profile card.
        db.select({ board: weeklyFinishes.board, rank: weeklyFinishes.rank, isoWeek: weeklyFinishes.isoWeek, createdAt: weeklyFinishes.createdAt })
            .from(weeklyFinishes)
            .where(and(eq(weeklyFinishes.userId, u.id), lte(weeklyFinishes.rank, 3)))
            .orderBy(asc(weeklyFinishes.createdAt))
            .catch(() => []),
        db.select({ createdAt: xpEvents.createdAt }).from(xpEvents)
            .where(and(eq(xpEvents.userId, u.id), eq(xpEvents.kind, "callout_10x")))
            .orderBy(asc(xpEvents.createdAt)).limit(1),
        db.select({ at: predictionBets.claimedAt, createdAt: predictionBets.createdAt }).from(predictionBets)
            .where(and(eq(predictionBets.userId, u.id), isNotNull(predictionBets.payoutUsdc), gt(predictionBets.payoutUsdc, predictionBets.amountUsdc)))
            .orderBy(asc(predictionBets.createdAt)).limit(1),
        u.shareTrades
            ? db.select({ realizedUsd: pnlSnapshots.realizedUsd, computedAt: pnlSnapshots.computedAt }).from(pnlSnapshots)
                .where(and(eq(pnlSnapshots.userId, u.id), eq(pnlSnapshots.window, "30d"))).limit(1)
            : Promise.resolve([]),
        db.select({ createdAt: tokens.createdAt }).from(tokens)
            .where(and(eq(tokens.creatorId, u.id), eq(tokens.status, "live")))
            .orderBy(asc(tokens.createdAt)).limit(1),
        // Distinct completed daily periodKeys ("2026-07-13"), recent window only.
        db.selectDistinct({ key: questProgress.periodKey }).from(questProgress)
            .where(and(
                eq(questProgress.userId, u.id),
                isNotNull(questProgress.completedAt),
                like(questProgress.questId, "daily%"),
            ))
            .orderBy(desc(questProgress.periodKey)).limit(90),
        u.createdAt
            ? db.select({ count: sql<number>`count(*)::int` }).from(user).where(lt(user.createdAt, u.createdAt))
            : Promise.resolve([{ count: EARLY_MEMBER_CUTOFF }]),
    ]);

    const earned = new Map<BadgeId, EarnedBadge>();

    for (const board of ["caller", "trader"] as const) {
        const rows = finishes.filter((f) => f.board === board);
        if (!rows.length) continue;
        const best = Math.min(...rows.map((r) => r.rank));
        earned.set(board === "caller" ? "top_caller" : "top_trader", {
            id: board === "caller" ? "top_caller" : "top_trader",
            earnedAt: iso(rows[0].createdAt),
            detail: `best finish #${best} · ${rows.length} week${rows.length === 1 ? "" : "s"}`,
        });
    }

    if (sniper.length) earned.set("callout_sniper", { id: "callout_sniper", earnedAt: iso(sniper[0].createdAt) });
    if (wonBet.length) earned.set("prophet", { id: "prophet", earnedAt: iso(wonBet[0].at ?? wonBet[0].createdAt) });
    if (pnl30.length && pnl30[0].realizedUsd > 0) {
        earned.set("profitable", { id: "profitable", earnedAt: iso(pnl30[0].computedAt) });
    }
    if (launched.length) earned.set("token_launcher", { id: "token_launcher", earnedAt: iso(launched[0].createdAt) });

    const lvl = levelBadgeId(u.level);
    if (lvl) earned.set(lvl, { id: lvl, earnedAt: null });

    const streak = longestRun(streakDays.map((r) => r.key));
    if (streak >= 7) earned.set("quest_streak", { id: "quest_streak", earnedAt: null, detail: `${streak}-day best` });

    if (signupsBefore[0].count < EARLY_MEMBER_CUTOFF) {
        earned.set("early_member", { id: "early_member", earnedAt: iso(u.createdAt), detail: `member #${signupsBefore[0].count + 1}` });
    }

    // Catalog order is display/priority order — chat's "top badge" is [0].
    return BADGE_CATALOG.filter((b) => earned.has(b.id)).map((b) => earned.get(b.id)!);
}

/** Longest run of consecutive UTC days in a set of "YYYY-MM-DD" keys. */
function longestRun(keys: string[]): number {
    const days = [...new Set(keys)]
        .map((k) => Date.parse(`${k}T00:00:00Z`))
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b);
    let best = 0, run = 0;
    for (let i = 0; i < days.length; i++) {
        run = i > 0 && days[i] - days[i - 1] === 86400000 ? run + 1 : 1;
        best = Math.max(best, run);
    }
    return best;
}
