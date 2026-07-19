import { db } from "@/db";
import { questProgress } from "@/db/schema/content";
import { nanoid } from "nanoid";
import { and, eq, isNull, sql } from "drizzle-orm";
import { QUESTS, periodKeyFor, type QuestEvent } from "@/lib/quests";
import { awardXP } from "./xp";
import { createNotification } from "./notify";

/**
 * Advance every quest tracking this event for the user's current windows.
 * Same contract as awardXP/createNotification: never throws.
 *
 * Progress is an atomic upsert against the (userId, questId, periodKey)
 * unique index, clamped at target. Completion is claimed with a conditional
 * update (completedAt IS NULL), so concurrent events can't double-pay; the
 * XP payout is additionally deduped by the xp_events unique index.
 */
export async function recordQuestEvent(userId: string, event: QuestEvent, count = 1): Promise<void> {
    try {
        for (const quest of QUESTS.filter((q) => q.event === event)) {
            const periodKey = periodKeyFor(quest.period);
            const [row] = await db
                .insert(questProgress)
                .values({ id: nanoid(), userId, questId: quest.id, periodKey, progress: Math.min(count, quest.target) })
                .onConflictDoUpdate({
                    target: [questProgress.userId, questProgress.questId, questProgress.periodKey],
                    set: { progress: sql`least(${questProgress.progress} + ${count}, ${quest.target})` },
                })
                .returning({ id: questProgress.id, progress: questProgress.progress, completedAt: questProgress.completedAt });

            if (row && row.progress >= quest.target && !row.completedAt) {
                const [claimed] = await db
                    .update(questProgress)
                    .set({ completedAt: new Date() })
                    .where(and(eq(questProgress.id, row.id), isNull(questProgress.completedAt)))
                    .returning({ id: questProgress.id });
                if (claimed) {
                    await awardXP(userId, "quest_completed", `${quest.id}:${periodKey}`, { amount: quest.xpReward });
                    await createNotification({
                        userId,
                        type: "system",
                        body: `Quest complete: ${quest.title} — +${quest.xpReward} XP`,
                    });
                }
            }
        }
    } catch { /* quest tracking must never break the main action */ }
}
