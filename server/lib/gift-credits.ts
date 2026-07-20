import { db } from "@/db";
import { giftSubscriptions, subscriptionTiers, subscriptions } from "@/db/schema/content";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createNotification } from "./notify";

// Twitch-style gift queue (owner decision 2026-07-20): when a paid-for gift
// had nobody eligible to receive it yet, it waits here instead of being
// refunded — the next person who follows that creator claims it. Called from
// user.follow right after the follow row lands.

export async function claimQueuedGiftForNewFollower(followerId: string, creatorId: string): Promise<void> {
    try {
        const alreadySubscribed = await db.select({ id: subscriptions.id }).from(subscriptions)
            .where(and(
                eq(subscriptions.subscriberId, followerId),
                eq(subscriptions.creatorId, creatorId),
                inArray(subscriptions.status, ["active", "past_due"]),
            )).limit(1);
        if (alreadySubscribed.length) return; // already has a tier with this creator — nothing to claim into

        const now = new Date();
        const [candidate] = await db.select({ id: giftSubscriptions.id })
            .from(giftSubscriptions)
            .where(and(
                eq(giftSubscriptions.creatorId, creatorId),
                isNull(giftSubscriptions.recipientId),
                eq(giftSubscriptions.status, "pending"),
                gt(giftSubscriptions.expiresAt, now),
            ))
            .orderBy(asc(giftSubscriptions.createdAt))
            .limit(1);
        if (!candidate) return;

        // Atomic claim: whoever's UPDATE actually matches a still-unclaimed
        // row wins the race if two people follow at the same instant.
        const [claimed] = await db.update(giftSubscriptions)
            .set({ recipientId: followerId, status: "redeemed", redeemedAt: now })
            .where(and(eq(giftSubscriptions.id, candidate.id), isNull(giftSubscriptions.recipientId)))
            .returning();
        if (!claimed) return;

        const tier = await db.query.subscriptionTiers.findFirst({ where: eq(subscriptionTiers.id, claimed.tierId) });
        if (!tier) return;

        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + claimed.durationMonths);

        await db.insert(subscriptions).values({
            id: nanoid(),
            subscriberId: followerId,
            creatorId,
            tierId: claimed.tierId,
            status: "active",
            billingCycle: "monthly",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
        }).onConflictDoUpdate({
            target: [subscriptions.subscriberId, subscriptions.creatorId],
            set: { status: "active", tierId: claimed.tierId, currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
        });

        await createNotification({
            userId: followerId,
            actorId: claimed.senderId,
            type: "system",
            body: `a gifted month of ${tier.name} was waiting for you — enjoy!`,
        });
    } catch { /* never block a follow on this */ }
}
