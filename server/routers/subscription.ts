import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import {
    subscriptionTiers, subscriptions, giftSubscriptions,
    creatorEarnings, dmUnlocks, payouts,
} from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, and, desc, count, sum, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

const LAMPORTS_PER_SOL = 1_000_000_000;

export const subscriptionRouter = router({
    // ─── Tiers (creator management) ──────────────────────────────────────────

    getTiers: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ input }) => {
            return db.select()
                .from(subscriptionTiers)
                .where(and(eq(subscriptionTiers.creatorId, input.creatorId), eq(subscriptionTiers.isActive, true)))
                .orderBy(subscriptionTiers.sortOrder, subscriptionTiers.priceMonthly);
        }),

    createTier: protectedProcedure
        .input(z.object({
            name: z.string().min(1).max(50),
            description: z.string().max(300).optional(),
            priceMonthly: z.number().int().positive(), // lamports
            priceAnnual: z.number().int().positive().optional(),
            perks: z.array(z.string().max(100)).max(10).default([]),
        }))
        .mutation(async ({ ctx, input }) => {
            // Max 3 active tiers per creator
            const existing = await db.select({ id: subscriptionTiers.id })
                .from(subscriptionTiers)
                .where(and(eq(subscriptionTiers.creatorId, ctx.user.id), eq(subscriptionTiers.isActive, true)));
            if (existing.length >= 3) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 3 active tiers allowed" });

            const tier = await db.insert(subscriptionTiers).values({
                id: nanoid(),
                creatorId: ctx.user.id,
                name: input.name,
                description: input.description,
                priceMonthly: input.priceMonthly,
                priceAnnual: input.priceAnnual,
                perks: input.perks,
                sortOrder: existing.length,
            }).returning();
            return tier[0];
        }),

    updateTier: protectedProcedure
        .input(z.object({
            tierId: z.string(),
            name: z.string().min(1).max(50).optional(),
            description: z.string().max(300).optional(),
            priceMonthly: z.number().int().positive().optional(),
            priceAnnual: z.number().int().positive().optional(),
            perks: z.array(z.string().max(100)).max(10).optional(),
            isActive: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { tierId, ...update } = input;
            await db.update(subscriptionTiers)
                .set(update)
                .where(and(eq(subscriptionTiers.id, tierId), eq(subscriptionTiers.creatorId, ctx.user.id)));
            return { success: true };
        }),

    deleteTier: protectedProcedure
        .input(z.object({ tierId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.update(subscriptionTiers)
                .set({ isActive: false })
                .where(and(eq(subscriptionTiers.id, input.tierId), eq(subscriptionTiers.creatorId, ctx.user.id)));
            return { success: true };
        }),

    // ─── Subscriptions ────────────────────────────────────────────────────────

    subscribe: protectedProcedure
        .input(z.object({
            tierId: z.string(),
            billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
            txSignature: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const tier = await db.query.subscriptionTiers.findFirst({
                where: eq(subscriptionTiers.id, input.tierId),
            });
            if (!tier || !tier.isActive) throw new TRPCError({ code: "NOT_FOUND", message: "Tier not found" });
            if (tier.creatorId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot subscribe to yourself" });

            const now = new Date();
            const periodEnd = new Date(now);
            if (input.billingCycle === "annual") {
                periodEnd.setFullYear(periodEnd.getFullYear() + 1);
            } else {
                periodEnd.setMonth(periodEnd.getMonth() + 1);
            }

            const price = input.billingCycle === "annual" && tier.priceAnnual ? tier.priceAnnual : tier.priceMonthly;

            // Upsert subscription
            await db.insert(subscriptions).values({
                id: nanoid(),
                subscriberId: ctx.user.id,
                creatorId: tier.creatorId,
                tierId: input.tierId,
                status: "active",
                billingCycle: input.billingCycle,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                txSignature: input.txSignature,
            }).onConflictDoUpdate({
                target: [subscriptions.subscriberId, subscriptions.creatorId],
                set: {
                    tierId: input.tierId,
                    status: "active",
                    billingCycle: input.billingCycle,
                    currentPeriodStart: now,
                    currentPeriodEnd: periodEnd,
                    cancelAtPeriodEnd: false,
                    cancelledAt: null,
                    txSignature: input.txSignature,
                },
            });

            // Record earnings for creator
            await db.insert(creatorEarnings).values({
                id: nanoid(),
                creatorId: tier.creatorId,
                type: "subscription",
                amountLamports: price,
                referenceId: ctx.user.id,
            });

            return { success: true };
        }),

    cancelSubscription: protectedProcedure
        .input(z.object({ creatorId: z.string(), immediately: z.boolean().default(false) }))
        .mutation(async ({ ctx, input }) => {
            if (input.immediately) {
                await db.update(subscriptions)
                    .set({ status: "cancelled", cancelledAt: new Date() })
                    .where(and(eq(subscriptions.subscriberId, ctx.user.id), eq(subscriptions.creatorId, input.creatorId)));
            } else {
                await db.update(subscriptions)
                    .set({ cancelAtPeriodEnd: true })
                    .where(and(eq(subscriptions.subscriberId, ctx.user.id), eq(subscriptions.creatorId, input.creatorId)));
            }
            return { success: true };
        }),

    getMySubscriptions: protectedProcedure.query(async ({ ctx }) => {
        return db.select({
            id: subscriptions.id,
            status: subscriptions.status,
            billingCycle: subscriptions.billingCycle,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
            tier: {
                id: subscriptionTiers.id,
                name: subscriptionTiers.name,
                priceMonthly: subscriptionTiers.priceMonthly,
            },
            creator: {
                id: user.id,
                name: user.name,
                username: user.username,
                avatar_url: user.avatar_url,
            },
        })
            .from(subscriptions)
            .innerJoin(subscriptionTiers, eq(subscriptions.tierId, subscriptionTiers.id))
            .innerJoin(user, eq(subscriptions.creatorId, user.id))
            .where(and(eq(subscriptions.subscriberId, ctx.user.id), eq(subscriptions.status, "active")))
            .orderBy(desc(subscriptions.currentPeriodEnd));
    }),

    getMySubscribers: protectedProcedure.query(async ({ ctx }) => {
        const subUser = await import("@/db/schema/auth").then(m => m.user);
        return db.select({
            id: subscriptions.id,
            status: subscriptions.status,
            billingCycle: subscriptions.billingCycle,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            tier: {
                id: subscriptionTiers.id,
                name: subscriptionTiers.name,
            },
            subscriber: {
                id: subUser.id,
                name: subUser.name,
                username: subUser.username,
                avatar_url: subUser.avatar_url,
            },
        })
            .from(subscriptions)
            .innerJoin(subscriptionTiers, eq(subscriptions.tierId, subscriptionTiers.id))
            .innerJoin(subUser, eq(subscriptions.subscriberId, subUser.id))
            .where(and(eq(subscriptions.creatorId, ctx.user.id), eq(subscriptions.status, "active")))
            .orderBy(desc(subscriptions.currentPeriodEnd));
    }),

    isSubscribed: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user) return { subscribed: false, tier: null };
            const row = await db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.subscriberId, ctx.user.id),
                    eq(subscriptions.creatorId, input.creatorId),
                    eq(subscriptions.status, "active"),
                ),
            });
            if (!row) return { subscribed: false, tier: null };
            const tier = await db.query.subscriptionTiers.findFirst({ where: eq(subscriptionTiers.id, row.tierId) });
            return { subscribed: true, tier };
        }),

    getSubscriberCount: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ input }) => {
            const [row] = await db.select({ count: count() })
                .from(subscriptions)
                .where(and(eq(subscriptions.creatorId, input.creatorId), eq(subscriptions.status, "active")));
            return { count: row?.count ?? 0 };
        }),

    // ─── Gift Subscriptions ───────────────────────────────────────────────────

    giftSubscription: protectedProcedure
        .input(z.object({
            recipientId: z.string(),
            tierId: z.string(),
            durationMonths: z.number().int().min(1).max(12).default(1),
            message: z.string().max(200).optional(),
            txSignature: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const tier = await db.query.subscriptionTiers.findFirst({ where: eq(subscriptionTiers.id, input.tierId) });
            if (!tier || !tier.isActive) throw new TRPCError({ code: "NOT_FOUND", message: "Tier not found" });

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // gift expires in 7 days if unredeemed

            await db.insert(giftSubscriptions).values({
                id: nanoid(),
                senderId: ctx.user.id,
                recipientId: input.recipientId,
                creatorId: tier.creatorId,
                tierId: input.tierId,
                durationMonths: input.durationMonths,
                message: input.message,
                txSignature: input.txSignature,
                expiresAt,
            });

            // Record earnings for creator
            const price = tier.priceMonthly * input.durationMonths;
            await db.insert(creatorEarnings).values({
                id: nanoid(),
                creatorId: tier.creatorId,
                type: "gift",
                amountLamports: price,
                referenceId: ctx.user.id,
            });

            return { success: true };
        }),

    redeemGift: protectedProcedure
        .input(z.object({ giftId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const gift = await db.query.giftSubscriptions.findFirst({
                where: and(
                    eq(giftSubscriptions.id, input.giftId),
                    eq(giftSubscriptions.recipientId, ctx.user.id),
                    eq(giftSubscriptions.status, "pending"),
                ),
            });
            if (!gift) throw new TRPCError({ code: "NOT_FOUND", message: "Gift not found or already redeemed" });
            if (gift.expiresAt < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Gift has expired" });

            // Activate subscription
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setMonth(periodEnd.getMonth() + gift.durationMonths);

            await db.insert(subscriptions).values({
                id: nanoid(),
                subscriberId: ctx.user.id,
                creatorId: gift.creatorId,
                tierId: gift.tierId,
                status: "active",
                billingCycle: "monthly",
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
            }).onConflictDoUpdate({
                target: [subscriptions.subscriberId, subscriptions.creatorId],
                set: { status: "active", tierId: gift.tierId, currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
            });

            // Mark gift redeemed
            await db.update(giftSubscriptions)
                .set({ status: "redeemed", redeemedAt: now })
                .where(eq(giftSubscriptions.id, input.giftId));

            return { success: true };
        }),

    getMyGifts: protectedProcedure.query(async ({ ctx }) => {
        const senderUser = await import("@/db/schema/auth").then(m => m.user);
        return db.select({
            id: giftSubscriptions.id,
            durationMonths: giftSubscriptions.durationMonths,
            message: giftSubscriptions.message,
            status: giftSubscriptions.status,
            expiresAt: giftSubscriptions.expiresAt,
            createdAt: giftSubscriptions.createdAt,
            tier: {
                id: subscriptionTiers.id,
                name: subscriptionTiers.name,
            },
            sender: {
                id: senderUser.id,
                name: senderUser.name,
                username: senderUser.username,
                avatar_url: senderUser.avatar_url,
            },
        })
            .from(giftSubscriptions)
            .innerJoin(subscriptionTiers, eq(giftSubscriptions.tierId, subscriptionTiers.id))
            .innerJoin(senderUser, eq(giftSubscriptions.senderId, senderUser.id))
            .where(and(eq(giftSubscriptions.recipientId, ctx.user.id), eq(giftSubscriptions.status, "pending")))
            .orderBy(desc(giftSubscriptions.createdAt));
    }),

    // ─── Earnings ─────────────────────────────────────────────────────────────

    getEarnings: protectedProcedure.query(async ({ ctx }) => {
        const rows = await db.select()
            .from(creatorEarnings)
            .where(eq(creatorEarnings.creatorId, ctx.user.id))
            .orderBy(desc(creatorEarnings.createdAt))
            .limit(100);

        const [totals] = await db.select({ total: sum(creatorEarnings.amountLamports) })
            .from(creatorEarnings)
            .where(eq(creatorEarnings.creatorId, ctx.user.id));

        // 30-day earnings
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const [monthly] = await db.select({ total: sum(creatorEarnings.amountLamports) })
            .from(creatorEarnings)
            .where(and(
                eq(creatorEarnings.creatorId, ctx.user.id),
                gte(creatorEarnings.createdAt, thirtyDaysAgo),
            ));

        return {
            history: rows,
            totalLamports: Number(totals?.total ?? 0),
            last30DaysLamports: Number(monthly?.total ?? 0),
        };
    }),

    // ─── Payouts ──────────────────────────────────────────────────────────────

    getPayouts: protectedProcedure.query(async ({ ctx }) => {
        return db.select()
            .from(payouts)
            .where(eq(payouts.creatorId, ctx.user.id))
            .orderBy(desc(payouts.createdAt));
    }),

    requestPayout: protectedProcedure
        .input(z.object({ amountLamports: z.number().int().positive() }))
        .mutation(async ({ ctx, input }) => {
            await db.insert(payouts).values({
                id: nanoid(),
                creatorId: ctx.user.id,
                amountLamports: input.amountLamports,
                status: "pending",
                note: "Requested via dashboard",
            });
            return { success: true };
        }),

    // ─── DM Unlock ────────────────────────────────────────────────────────────

    unlockDMs: protectedProcedure
        .input(z.object({ creatorId: z.string(), txSignature: z.string().optional() }))
        .mutation(async ({ ctx, input }) => {
            const [creator] = await db.select({ dmPrice: user.dmPrice })
                .from(user)
                .where(eq(user.id, input.creatorId))
                .limit(1);
            if (!creator?.dmPrice) throw new TRPCError({ code: "BAD_REQUEST", message: "DMs are free for this user" });

            await db.insert(dmUnlocks).values({
                id: nanoid(),
                payerId: ctx.user.id,
                creatorId: input.creatorId,
                amountLamports: creator.dmPrice,
                txSignature: input.txSignature,
            }).onConflictDoNothing();

            // Record earnings
            await db.insert(creatorEarnings).values({
                id: nanoid(),
                creatorId: input.creatorId,
                type: "dm_unlock",
                amountLamports: creator.dmPrice,
                referenceId: ctx.user.id,
            });

            return { success: true };
        }),

    hasDMAccess: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user) return { hasAccess: false, dmPrice: null };
            if (ctx.user.id === input.creatorId) return { hasAccess: true, dmPrice: null };

            const [creator] = await db.select({ dmPrice: user.dmPrice })
                .from(user).where(eq(user.id, input.creatorId)).limit(1);
            const price = creator?.dmPrice ?? null;
            if (!price) return { hasAccess: true, dmPrice: null };

            // Check if already unlocked
            const unlock = await db.query.dmUnlocks.findFirst({
                where: and(eq(dmUnlocks.payerId, ctx.user.id), eq(dmUnlocks.creatorId, input.creatorId)),
            });
            // Check if subscriber
            const sub = await db.query.subscriptions.findFirst({
                where: and(
                    eq(subscriptions.subscriberId, ctx.user.id),
                    eq(subscriptions.creatorId, input.creatorId),
                    eq(subscriptions.status, "active"),
                ),
            });

            return { hasAccess: !!(unlock || sub), dmPrice: price };
        }),
});
