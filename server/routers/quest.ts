import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { questProgress, xpEvents } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { and, desc, eq, inArray } from "drizzle-orm";
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

    /** Recent XP awards — the "where did my XP come from" breakdown. */
    recentXp: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(30).default(15) }).optional())
        .query(async ({ ctx, input }) => {
            const rows = await db
                .select({ kind: xpEvents.kind, amount: xpEvents.amount, createdAt: xpEvents.createdAt })
                .from(xpEvents)
                .where(eq(xpEvents.userId, ctx.user.id))
                .orderBy(desc(xpEvents.createdAt))
                .limit(input?.limit ?? 15);
            return { events: rows };
        }),
});
