import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import {
    subscriptionTiers, subscriptions, giftSubscriptions,
    creatorEarnings, dmUnlocks, payouts, follows,
} from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, and, desc, count, sum, gte, sql, inArray, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { PERIOD_HOURS } from "@/lib/premium/tiers";
import {
    chargeSubscriber,
    createTreasuryPlan,
    transferUsdcFromTreasury,
} from "@/lib/chains/solana/subscriptions/collector";
import { getMerchantAddress } from "@/lib/chains/solana/subscriptions/constants";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { verifyUsdcPaymentToTreasury, getTreasuryUsdcAta } from "@/lib/chains/solana/verify-usdc-payment";
import { verifySolPayment } from "@/lib/chains/solana/verify-sol-payment";
import { createNotification } from "@/server/lib/notify";

const LAMPORTS_PER_SOL = 1_000_000_000;
const PLATFORM_FEE_BPS = 500; // 5% platform fee, taken at claim time

/** Allocate a globally-unique on-chain plan id (treasury owns all plans). */
async function nextPlanId(): Promise<number> {
    const r = await db.execute<{ id: number }>(sql`SELECT nextval('premium_plan_id_seq')::int AS id`);
    // postgres.js returns an array-like of rows
    const row = (r as unknown as Array<{ id: number }>)[0];
    return Number(row.id);
}

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
            // USDC base units (6dp). e.g. $5.00 = 5_000_000.
            priceUsdcMonthly: z.number().int().positive(),
            priceUsdcAnnual: z.number().int().positive().optional(),
            perks: z.array(z.string().max(100)).max(10).default([]),
        }))
        .mutation(async ({ ctx, input }) => {
            // Max 3 active tiers per creator
            const existing = await db.select({ id: subscriptionTiers.id })
                .from(subscriptionTiers)
                .where(and(eq(subscriptionTiers.creatorId, ctx.user.id), eq(subscriptionTiers.isActive, true)));
            if (existing.length >= 3) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 3 active tiers allowed" });

            // Provision the on-chain plan(s) under the treasury (it owns all plans).
            const planIdMonthly = await nextPlanId();
            const monthly = await createTreasuryPlan({
                planId: planIdMonthly,
                amountBaseUnits: BigInt(input.priceUsdcMonthly),
                periodHours: PERIOD_HOURS.monthly,
            });

            let planIdAnnual: number | null = null;
            let annual: { planPda: string; createdAtChain: number | null } | null = null;
            if (input.priceUsdcAnnual) {
                planIdAnnual = await nextPlanId();
                annual = await createTreasuryPlan({
                    planId: planIdAnnual,
                    amountBaseUnits: BigInt(input.priceUsdcAnnual),
                    periodHours: PERIOD_HOURS.annual,
                });
            }

            const tier = await db.insert(subscriptionTiers).values({
                id: nanoid(),
                creatorId: ctx.user.id,
                name: input.name,
                description: input.description,
                priceMonthly: 0, // legacy lamports column unused for USDC tiers
                priceUsdcMonthly: input.priceUsdcMonthly,
                priceUsdcAnnual: input.priceUsdcAnnual ?? null,
                planIdMonthly,
                planIdAnnual,
                planPdaMonthly: monthly.planPda,
                planPdaAnnual: annual?.planPda ?? null,
                createdAtChainMonthly: monthly.createdAtChain,
                createdAtChainAnnual: annual?.createdAtChain ?? null,
                perks: input.perks,
                sortOrder: existing.length,
            }).returning();
            return tier[0];
        }),

    // Note: on-chain plan terms (price/period) are IMMUTABLE. updateTier only
    // touches presentation/availability; to change price, delete + recreate the
    // tier (existing subscribers keep their plan until they resubscribe).
    updateTier: protectedProcedure
        .input(z.object({
            tierId: z.string(),
            name: z.string().min(1).max(50).optional(),
            description: z.string().max(300).optional(),
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
    // (The legacy `subscribe` mutation that lived here — lamports-priced,
    // granted "active" on an unverified optional txSignature, no client
    // caller anywhere in the app — was deleted 2026-07-20. It predated and
    // was fully superseded by recordCreatorSubscription below, which
    // independently pulls the USDC charge server-side via chargeSubscriber
    // instead of trusting anything the client claims.)

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

    // ─── On-chain creator subscription (USDC, treasury-owned plan) ──────────────
    // After the client confirms the on-chain subscribe, persist + charge the first
    // period (treasury pulls), and credit the creator's gross to the ledger.
    recordCreatorSubscription: protectedProcedure
        .input(z.object({
            tierId: z.string(),
            billingCycle: z.enum(["monthly", "annual"]),
            subscriberWallet: z.string(),
            planPda: z.string(),
            subscriptionPda: z.string(),
            subscriptionAuthorityPda: z.string(),
            delegatorAta: z.string(),
            subscribeTxSignature: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const tier = await db.query.subscriptionTiers.findFirst({
                where: eq(subscriptionTiers.id, input.tierId),
            });
            if (!tier || !tier.isActive) throw new TRPCError({ code: "NOT_FOUND", message: "Tier not found" });
            if (tier.creatorId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot subscribe to yourself" });

            const annual = input.billingCycle === "annual";
            const planId = annual ? tier.planIdAnnual : tier.planIdMonthly;
            const priceUsdc = annual ? tier.priceUsdcAnnual : tier.priceUsdcMonthly;
            if (!planId || !priceUsdc) throw new TRPCError({ code: "BAD_REQUEST", message: "Tier has no plan for this cycle" });

            const now = new Date();
            const periodHours = annual ? PERIOD_HOURS.annual : PERIOD_HOURS.monthly;

            // Charge the first period now (treasury pulls). Access only if it lands.
            let chargeSig: string | null = null;
            try {
                chargeSig = await chargeSubscriber({
                    subscriber: input.subscriberWallet,
                    merchant: getMerchantAddress(),
                    planId,
                    amountBaseUnits: BigInt(priceUsdc),
                });
            } catch {
                chargeSig = null;
            }
            const charged = chargeSig !== null;
            const periodEnd = charged ? new Date(now.getTime() + periodHours * 3600 * 1000) : now;

            const subId = nanoid();
            const shared = {
                tierId: input.tierId,
                status: (charged ? "active" : "past_due") as "active" | "past_due",
                billingCycle: input.billingCycle,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: false,
                cancelledAt: null,
                priceUsdc,
                planId,
                planPda: input.planPda,
                subscriberWallet: input.subscriberWallet,
                subscriptionPda: input.subscriptionPda,
                subscriptionAuthorityPda: input.subscriptionAuthorityPda,
                delegatorAta: input.delegatorAta,
                txSignature: input.subscribeTxSignature,
                lastChargeSig: chargeSig,
                lastChargeAt: charged ? now : null,
                failedAttempts: charged ? 0 : 1,
            };
            await db.insert(subscriptions)
                .values({ id: subId, subscriberId: ctx.user.id, creatorId: tier.creatorId, ...shared })
                .onConflictDoUpdate({ target: [subscriptions.subscriberId, subscriptions.creatorId], set: shared });

            // Credit the creator's gross to the claimable ledger.
            if (charged) {
                await db.insert(creatorEarnings).values({
                    id: nanoid(),
                    creatorId: tier.creatorId,
                    type: "subscription",
                    amountLamports: 0,
                    amountUsdc: priceUsdc,
                    referenceId: subId,
                    claimed: false,
                });
            }

            return { success: true, charged };
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
    // Twitch-style community gifting (owner decision 2026-07-20): the gifter
    // picks a quantity, not a specific person — subs land on random eligible
    // followers who don't already have one, distributed immediately (no
    // pending/claim step). Real payment required: one lump-sum USDC transfer
    // to the treasury, verified on-chain the same way predictions.ts verifies
    // bets — this replaces the original mutation, which never checked payment
    // at all (see the disabled version this replaced, in git history).

    /** How many of the creator's followers could receive a gift right now. Client clamps its quantity picker to this before building the payment. */
    getGiftEligibleCount: publicProcedure
        .input(z.object({ creatorId: z.string() }))
        .query(async ({ ctx, input }) => {
            if (!ctx.user) return { count: 0 };
            const [row] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(follows)
                .leftJoin(subscriptions, and(
                    eq(subscriptions.subscriberId, follows.followerId),
                    eq(subscriptions.creatorId, input.creatorId),
                    inArray(subscriptions.status, ["active", "past_due"]),
                ))
                .where(and(
                    eq(follows.followingId, input.creatorId),
                    sql`${subscriptions.id} IS NULL`,
                    ne(follows.followerId, ctx.user.id),
                ));
            return { count: row?.count ?? 0 };
        }),

    giftSubscription: protectedProcedure
        .input(z.object({
            creatorId: z.string(),
            tierId: z.string(),
            quantity: z.number().int().min(1).max(50),
            message: z.string().max(200).optional(),
            txSignature: z.string().min(64).max(120),
        }))
        .mutation(async ({ ctx, input }) => {
            const tier = await db.query.subscriptionTiers.findFirst({ where: eq(subscriptionTiers.id, input.tierId) });
            if (!tier || !tier.isActive || tier.creatorId !== input.creatorId) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Tier not found" });
            }
            if (tier.creatorId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot gift subscriptions to your own community" });
            }
            if (!tier.priceUsdcMonthly) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "This tier has no USDC plan configured" });
            }

            // Replay guard — a bulk gift's one signature covers every row it
            // creates, so this can't be a DB-level unique constraint; check first.
            const already = await db.select({ id: giftSubscriptions.id })
                .from(giftSubscriptions)
                .where(eq(giftSubscriptions.txSignature, input.txSignature))
                .limit(1);
            if (already.length) throw new TRPCError({ code: "CONFLICT", message: "This payment was already redeemed" });

            const eligible = await db
                .select({ id: follows.followerId })
                .from(follows)
                .leftJoin(subscriptions, and(
                    eq(subscriptions.subscriberId, follows.followerId),
                    eq(subscriptions.creatorId, input.creatorId),
                    inArray(subscriptions.status, ["active", "past_due"]),
                ))
                .where(and(
                    eq(follows.followingId, input.creatorId),
                    sql`${subscriptions.id} IS NULL`,
                    ne(follows.followerId, ctx.user.id),
                ))
                .orderBy(sql`random()`)
                .limit(input.quantity);

            const expected = BigInt(tier.priceUsdcMonthly) * BigInt(input.quantity);
            const treasuryAta = await getTreasuryUsdcAta(getBoostTreasuryOwner());
            await verifyUsdcPaymentToTreasury(input.txSignature, expected, treasuryAta);

            if (eligible.length < input.quantity) {
                // Never grant fewer gifts than were paid for — refund in full.
                // (Client clamps quantity to getGiftEligibleCount first, so
                // this only fires on a genuine race: someone else gifted the
                // last slot between the client's check and this charge.)
                const [gifter] = await db.select({ wallet: user.wallet_address }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
                if (gifter?.wallet) {
                    await transferUsdcFromTreasury(gifter.wallet, expected).catch(() => {});
                }
                throw new TRPCError({
                    code: "CONFLICT",
                    message: `Only ${eligible.length} eligible follower${eligible.length === 1 ? "" : "s"} left — someone else may have just gifted. Payment refunded, try a smaller quantity.`,
                });
            }

            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setMonth(periodEnd.getMonth() + 1);

            // Payment is already verified on-chain above — everything from here
            // is bookkeeping that must land together. One transaction so a
            // mid-loop crash can't leave some recipients subscribed while the
            // creator never gets credited for gifts that already went out.
            await db.transaction(async (tx) => {
                for (const recipient of eligible) {
                    await tx.insert(subscriptions).values({
                        id: nanoid(),
                        subscriberId: recipient.id,
                        creatorId: input.creatorId,
                        tierId: input.tierId,
                        status: "active",
                        billingCycle: "monthly",
                        currentPeriodStart: now,
                        currentPeriodEnd: periodEnd,
                        // No planId/wallet on file for the recipient — this is a
                        // one-off grant, not a delegated recurring plan, so the
                        // renewal cron's isNotNull(planId) filter naturally skips
                        // it and it just lapses at periodEnd instead of retrying
                        // a charge nobody authorized.
                    }).onConflictDoUpdate({
                        target: [subscriptions.subscriberId, subscriptions.creatorId],
                        set: { status: "active", tierId: input.tierId, currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false },
                    });

                    await tx.insert(giftSubscriptions).values({
                        id: nanoid(),
                        senderId: ctx.user.id,
                        recipientId: recipient.id,
                        creatorId: input.creatorId,
                        tierId: input.tierId,
                        durationMonths: 1,
                        message: input.message,
                        status: "redeemed",
                        txSignature: input.txSignature,
                        redeemedAt: now,
                        expiresAt: periodEnd,
                    });
                }

                await tx.insert(creatorEarnings).values({
                    id: nanoid(),
                    creatorId: input.creatorId,
                    type: "gift",
                    amountLamports: 0,
                    amountUsdc: Number(expected),
                    referenceId: ctx.user.id,
                });
            });

            // Best-effort, outside the transaction — a notification hiccup
            // must never roll back subscriptions that already landed.
            for (const recipient of eligible) {
                await createNotification({
                    userId: recipient.id,
                    actorId: ctx.user.id,
                    type: "system",
                    body: `gifted you a month of ${tier.name}!`,
                });
            }

            return { success: true, gifted: eligible.length };
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

    // ─── Claimable USDC balance (gross, fee, net) ──────────────────────────────
    getClaimable: protectedProcedure.query(async ({ ctx }) => {
        const [row] = await db.select({ gross: sum(creatorEarnings.amountUsdc) })
            .from(creatorEarnings)
            .where(and(eq(creatorEarnings.creatorId, ctx.user.id), eq(creatorEarnings.claimed, false)));
        const gross = Number(row?.gross ?? 0);
        const fee = Math.floor((gross * PLATFORM_FEE_BPS) / 10000);
        return { grossUsdc: gross, feeUsdc: fee, netUsdc: gross - fee, feeBps: PLATFORM_FEE_BPS };
    }),

    // ─── Claim: pay net USDC (gross − 5% fee) from treasury to creator wallet ───
    claimEarnings: protectedProcedure.mutation(async ({ ctx }) => {
        // Snapshot the exact unclaimed rows so concurrent earnings aren't swept.
        const rows = await db.select({ id: creatorEarnings.id, amountUsdc: creatorEarnings.amountUsdc })
            .from(creatorEarnings)
            .where(and(eq(creatorEarnings.creatorId, ctx.user.id), eq(creatorEarnings.claimed, false)));
        const gross = rows.reduce((s, r) => s + Number(r.amountUsdc ?? 0), 0);
        if (gross <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to claim" });

        const [u] = await db.select({ wallet: user.wallet_address }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
        if (!u?.wallet) throw new TRPCError({ code: "BAD_REQUEST", message: "No wallet on file to receive USDC" });

        const fee = Math.floor((gross * PLATFORM_FEE_BPS) / 10000);
        const net = gross - fee;

        const sig = await transferUsdcFromTreasury(u.wallet, BigInt(net));

        const payoutId = nanoid();
        await db.insert(payouts).values({
            id: payoutId,
            creatorId: ctx.user.id,
            amountLamports: 0,
            amountUsdc: net,
            feeUsdc: fee,
            recipientWallet: u.wallet,
            status: "completed",
            txSignature: sig,
            note: "Creator subscription earnings claim",
            completedAt: new Date(),
        });

        // Mark exactly the snapshotted rows claimed.
        await db.update(creatorEarnings)
            .set({ claimed: true, payoutId })
            .where(and(
                eq(creatorEarnings.creatorId, ctx.user.id),
                eq(creatorEarnings.claimed, false),
                inArray(creatorEarnings.id, rows.map((r) => r.id)),
            ));

        return { success: true, netUsdc: net, feeUsdc: fee, signature: sig };
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
        .input(z.object({ creatorId: z.string(), txSignature: z.string().min(64).max(120) }))
        .mutation(async ({ ctx, input }) => {
            const [creator] = await db.select({ dmPrice: user.dmPrice, wallet: user.wallet_address })
                .from(user)
                .where(eq(user.id, input.creatorId))
                .limit(1);
            if (!creator?.dmPrice) throw new TRPCError({ code: "BAD_REQUEST", message: "DMs are free for this user" });
            if (!creator.wallet) throw new TRPCError({ code: "BAD_REQUEST", message: "This creator has no wallet on file to receive payment" });

            const already = await db.query.dmUnlocks.findFirst({ where: eq(dmUnlocks.txSignature, input.txSignature) });
            if (already) throw new TRPCError({ code: "CONFLICT", message: "This payment was already redeemed" });

            await verifySolPayment(input.txSignature, creator.dmPrice, creator.wallet);

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
