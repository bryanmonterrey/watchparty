import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { questProgress } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { and, eq, inArray } from "drizzle-orm";
import { QUESTS, periodKeyFor, periodResetAt } from "@/lib/quests";

/**
 * Quests read surface (docs/exp-callouts.md, Phase 3). Definitions come from
 * the code catalog; only progress lives in the DB. Completion is auto-claimed
 * server-side by recordQuestEvent, so this is purely a view.
 */
export const questRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        const now = new Date();
        const keys = { daily: periodKeyFor("daily", now), weekly: periodKeyFor("weekly", now) };

        // Session user doesn't carry custom columns — read xp from the table.
        const [me] = await db.select({ xp: user.xp }).from(user).where(eq(user.id, ctx.user.id));

        const rows = await db
            .select({
                questId: questProgress.questId,
                periodKey: questProgress.periodKey,
                progress: questProgress.progress,
                completedAt: questProgress.completedAt,
            })
            .from(questProgress)
            .where(and(
                eq(questProgress.userId, ctx.user.id),
                inArray(questProgress.periodKey, [keys.daily, keys.weekly]),
            ));
        const byQuest = new Map(rows.map((r) => [`${r.questId}:${r.periodKey}`, r]));

        const quests = QUESTS.map((q) => {
            const row = byQuest.get(`${q.id}:${keys[q.period]}`);
            return {
                id: q.id,
                title: q.title,
                target: q.target,
                xpReward: q.xpReward,
                period: q.period,
                progress: Math.min(row?.progress ?? 0, q.target),
                completed: !!row?.completedAt,
            };
        });

        return {
            xp: me?.xp ?? 0,
            daily: quests.filter((q) => q.period === "daily"),
            weekly: quests.filter((q) => q.period === "weekly"),
            resetAt: { daily: periodResetAt("daily", now), weekly: periodResetAt("weekly", now) },
        };
    }),
});
