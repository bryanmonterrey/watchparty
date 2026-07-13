import { db } from "@/db";
import { xpEvents } from "@/db/schema/content";
import { user } from "@/db/schema/auth/user";
import { nanoid } from "nanoid";
import { and, eq, gte, sql } from "drizzle-orm";
import { XP_AWARDS, levelForXp, type XpKind } from "@/lib/xp";

interface AwardResult {
    awarded: boolean;
    leveledUp?: { from: number; to: number };
}

/**
 * Award XP to a user for an action. Same contract as createNotification:
 * never throws — XP failure must never break the main action.
 *
 * - Idempotent: the (userId, kind, refId) unique index swallows duplicates,
 *   so re-fired mutations (like → unlike → like) can't double-award.
 * - Capped: each kind pays out at most XP_AWARDS[kind].maxPerDay times per
 *   UTC day.
 * - Rolls up user.xp / user.level in the same call.
 */
export async function awardXP(
    userId: string,
    kind: XpKind,
    refId: string,
    opts?: { amount?: number }, // per-award override (quest rewards vary by quest)
): Promise<AwardResult> {
    try {
        const { maxPerDay } = XP_AWARDS[kind];
        const amount = opts?.amount ?? XP_AWARDS[kind].amount;

        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(xpEvents)
            .where(and(eq(xpEvents.userId, userId), eq(xpEvents.kind, kind), gte(xpEvents.createdAt, dayStart)));
        if (count >= maxPerDay) return { awarded: false };

        const inserted = await db
            .insert(xpEvents)
            .values({ id: nanoid(), userId, kind, refId, amount })
            .onConflictDoNothing()
            .returning({ id: xpEvents.id });
        if (inserted.length === 0) return { awarded: false }; // already awarded for this ref

        const [updated] = await db
            .update(user)
            .set({ xp: sql`${user.xp} + ${amount}` })
            .where(eq(user.id, userId))
            .returning({ xp: user.xp, level: user.level });
        if (!updated) return { awarded: true };

        const newLevel = levelForXp(updated.xp);
        if (newLevel !== updated.level) {
            await db.update(user).set({ level: newLevel }).where(eq(user.id, userId));
            return { awarded: true, leveledUp: { from: updated.level, to: newLevel } };
        }
        return { awarded: true };
    } catch {
        return { awarded: false };
    }
}
