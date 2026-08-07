import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { premiumPlans, premiumSubscriptions, premiumLeads, premiumGifts } from "@/db/schema/content";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import {
    TIERS,
    INDIVIDUAL_TIERS,
    PERIOD_HOURS,
    type TierKey,
    type BillingCycle,
    priceUsd,
    priceBaseUnits,
    formatUsd,
} from "@/lib/premium/tiers";
import { syncPremiumBadge } from "@/server/lib/premium-verified";
import { isEntitled } from "@/server/lib/premium-entitlement";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { verifyUsdcPaymentToTreasury, getTreasuryUsdcAta } from "@/lib/chains/solana/verify-usdc-payment";
import { createNotification } from "@/server/lib/notify";

const TIER_KEYS = Object.keys(TIERS) as [TierKey, ...TierKey[]];

interface PlanRef {
    planId: number;
    planPda: string;
    merchant: string;
    mint: string;
    amountBaseUnits: string;
    periodHours: number;
    createdAt: string;
}

export const premiumRouter = router({
    // ─── Plans + tier matrix (for the upgrade overlay) ───────────────────────
    getPlans: publicProcedure.query(async () => {
        const rows = await db.select().from(premiumPlans);

        const byTierCycle = new Map<string, (typeof rows)[number]>();
        for (const r of rows) byTierCycle.set(`${r.tierKey}:${r.billingCycle}`, r);

        const toRef = (key: TierKey, cycle: BillingCycle): PlanRef | null => {
            const r = byTierCycle.get(`${key}:${cycle}`);
            if (!r) return null;
            return {
                planId: r.planId,
                planPda: r.planPda,
                merchant: r.collector,
                mint: r.mint,
                amountBaseUnits: String(r.priceUsdcBaseUnits),
                periodHours: r.periodHours,
                createdAt: String(r.createdAtChain ?? 0),
            };
        };

        const tiers = TIER_KEYS.map((key) => {
            const t = TIERS[key];
            return {
                key,
                group: t.group,
                name: t.name,
                tagline: t.tagline,
                highlighted: t.highlighted ?? false,
                selfServe: t.selfServe,
                features: t.features,
                monthlyUsd: t.monthlyUsd,
                monthlyLabel: t.selfServe ? formatUsd(priceUsd(key, "monthly")) : "Contact sales",
                annualUsd: t.selfServe ? priceUsd(key, "annual") : 0,
                annualLabel: t.selfServe ? formatUsd(priceUsd(key, "annual")) : "Contact sales",
                plans: {
                    monthly: toRef(key, "monthly"),
                    annual: toRef(key, "annual"),
                },
            };
        });

        return { tiers };
    }),

    // ─── Current entitlement (source of truth for gating) ────────────────────
    //
    // The active/past_due/periodEnd predicate now lives in
    // server/lib/premium-entitlement.ts so the assistant's quota gate and
    // community's boost allowance read the same rule. This keeps its own full
    // row select — it returns billing fields the helper doesn't carry (cycle,
    // cancelAtPeriodEnd) — and applies the shared predicate to it.
    getStatus: protectedProcedure.query(async ({ ctx }) => {
        const [row] = await db
            .select()
            .from(premiumSubscriptions)
            .where(eq(premiumSubscriptions.userId, ctx.user.id))
            .limit(1);

        if (!row) return { entitled: false as const, subscription: null };

        return {
            entitled: isEntitled(row),
            subscription: {
                tierKey: row.tierKey as TierKey,
                group: TIERS[row.tierKey as TierKey]?.group ?? "individual",
                billingCycle: row.billingCycle,
                status: row.status,
                currentPeriodEnd: row.currentPeriodEnd,
                cancelAtPeriodEnd: row.cancelAtPeriodEnd,
            },
        };
    }),

    // ─── Persist a confirmed on-chain subscription ───────────────────────────
    recordSubscription: protectedProcedure
        .input(
            z.object({
                tierKey: z.enum(TIER_KEYS),
                billingCycle: z.enum(["monthly", "annual"]),
                subscriberWallet: z.string(),
                planPda: z.string(),
                subscriptionPda: z.string(),
                subscriptionAuthorityPda: z.string(),
                delegatorAta: z.string(),
                subscribeTxSignature: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const tier = TIERS[input.tierKey];
            if (!tier.selfServe) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Tier is not self-serve" });
            }

            // Verify the plan exists for this (tier, cycle).
            const [plan] = await db
                .select()
                .from(premiumPlans)
                .where(
                    and(
                        eq(premiumPlans.tierKey, input.tierKey),
                        eq(premiumPlans.billingCycle, input.billingCycle),
                    ),
                )
                .limit(1);
            if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not provisioned" });

            const now = new Date();

            // Subscribe only AUTHORIZES the on-chain delegation; it does not move
            // funds. Charge the first period now (merchant pulls via the program)
            // so the user actually pays at signup, like any SaaS. Access is granted
            // only if this pull succeeds; otherwise the row is past_due and the
            // collector retries.
            let chargeSig: string | null = null;
            try {
                // Lazy — the collector pulls in @solana/kit + the subscriptions
                // program client; keep it out of the eager appRouter graph.
                const { chargeSubscriber } = await import("@/lib/chains/solana/subscriptions/collector");
                chargeSig = await chargeSubscriber({
                    subscriber: input.subscriberWallet,
                    merchant: plan.collector,
                    planId: plan.planId,
                    amountBaseUnits: BigInt(plan.priceUsdcBaseUnits),
                });
            } catch {
                chargeSig = null;
            }

            const charged = chargeSig !== null;
            if (charged && chargeSig) {
                // Referral reward (10% of the payment) — never fails the charge.
                const { creditReferralReward } = await import("@/lib/referral/rewards");
                await creditReferralReward(ctx.user.id, BigInt(plan.priceUsdcBaseUnits), chargeSig).catch(() => {});
            }
            const status = charged ? ("active" as const) : ("past_due" as const);
            // Entitlement keys off currentPeriodEnd; if the first charge failed we
            // leave the period ended (now) so the user isn't entitled until paid.
            const periodEnd = charged
                ? new Date(now.getTime() + plan.periodHours * 3600 * 1000)
                : now;

            const shared = {
                tierKey: input.tierKey,
                billingCycle: input.billingCycle,
                status,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                subscriberWallet: input.subscriberWallet,
                planPda: input.planPda,
                subscriptionPda: input.subscriptionPda,
                subscriptionAuthorityPda: input.subscriptionAuthorityPda,
                delegatorAta: input.delegatorAta,
                subscribeTxSignature: input.subscribeTxSignature,
                lastChargeSig: chargeSig,
                lastChargeAt: charged ? now : null,
                failedAttempts: charged ? 0 : 1,
                cancelAtPeriodEnd: false,
                cancelledAt: null,
            };

            await db
                .insert(premiumSubscriptions)
                .values({ id: nanoid(), userId: ctx.user.id, ...shared })
                .onConflictDoUpdate({ target: premiumSubscriptions.userId, set: shared });

            // Premium subscribers get a checkmark (owner decision 2026-07-20)
            // — only on an actual successful USDC pull, not a past_due row
            // awaiting retry. tier.group picks verified vs. business.
            if (charged) await syncPremiumBadge(ctx.user.id, tier.group);

            return { success: true, charged };
        }),

    // ─── Cancel at period end (stops auto-renew; access lasts the period) ────
    cancel: protectedProcedure
        .input(z.object({ immediately: z.boolean().default(false) }).optional())
        .mutation(async ({ ctx, input }) => {
            if (input?.immediately) {
                await db
                    .update(premiumSubscriptions)
                    .set({ status: "cancelled", cancelAtPeriodEnd: true, cancelledAt: new Date() })
                    .where(eq(premiumSubscriptions.userId, ctx.user.id));
                await syncPremiumBadge(ctx.user.id, null);
            } else {
                await db
                    .update(premiumSubscriptions)
                    .set({ cancelAtPeriodEnd: true })
                    .where(eq(premiumSubscriptions.userId, ctx.user.id));
            }
            return { success: true };
        }),

    // ─── Enterprise / Custom: contact sales ──────────────────────────────────
    contactSales: protectedProcedure
        .input(
            z.object({
                name: z.string().min(1).max(120),
                email: z.string().email(),
                orgName: z.string().max(160).optional(),
                message: z.string().max(2000).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await db.insert(premiumLeads).values({
                id: nanoid(),
                userId: ctx.user.id,
                name: input.name,
                email: input.email,
                orgName: input.orgName,
                message: input.message,
                status: "new",
            });
            return { success: true };
        }),

    // ─── Gift Premium (individual tiers only) ────────────────────────────────
    // Discord-Nitro-style (owner decision 2026-07-20): gift a specific person
    // a platform tier directly, not tied to any creator/follower pool. One
    // lump-sum USDC transfer to the treasury, verified on-chain — same trust
    // model as gift-subs, just applied to premiumSubscriptions instead of a
    // random-eligible-follower pool.
    giftPremium: protectedProcedure
        .input(z.object({
            recipientId: z.string(),
            tierKey: z.enum(INDIVIDUAL_TIERS as [TierKey, ...TierKey[]]),
            billingCycle: z.enum(["monthly", "annual"]),
            txSignature: z.string().min(64).max(120),
        }))
        .mutation(async ({ ctx, input }) => {
            if (input.recipientId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot gift premium to yourself" });
            }
            const tier = TIERS[input.tierKey];
            if (!tier.selfServe) throw new TRPCError({ code: "BAD_REQUEST", message: "Tier is not giftable" });

            const already = await db.select({ id: premiumGifts.id }).from(premiumGifts)
                .where(eq(premiumGifts.txSignature, input.txSignature)).limit(1);
            if (already.length) throw new TRPCError({ code: "CONFLICT", message: "This payment was already redeemed" });

            const expected = priceBaseUnits(input.tierKey, input.billingCycle);
            const treasuryAta = await getTreasuryUsdcAta(getBoostTreasuryOwner());
            await verifyUsdcPaymentToTreasury(input.txSignature, expected, treasuryAta);

            const periodHours = input.billingCycle === "annual" ? PERIOD_HOURS.annual : PERIOD_HOURS.monthly;
            const now = new Date();

            const [existing] = await db.select().from(premiumSubscriptions)
                .where(eq(premiumSubscriptions.userId, input.recipientId)).limit(1);

            // Stack, never shorten or downgrade: extend from whichever is
            // later (now, or their current unexpired period), and only
            // switch tierKey if the gift is the same tier or an upgrade.
            const stillActive = existing && existing.status !== "cancelled" && existing.status !== "expired" && existing.currentPeriodEnd > now;
            const base = stillActive ? existing.currentPeriodEnd : now;
            const periodEnd = new Date(base.getTime() + periodHours * 3600 * 1000);
            const tierRank: Record<string, number> = { basic: 1, premium: 2 };
            const resolvedTierKey = stillActive && (tierRank[existing.tierKey] ?? 0) > (tierRank[input.tierKey] ?? 0)
                ? existing.tierKey
                : input.tierKey;

            await db.insert(premiumSubscriptions).values({
                id: nanoid(),
                userId: input.recipientId,
                tierKey: resolvedTierKey,
                billingCycle: input.billingCycle,
                status: "active",
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: false,
                cancelledAt: null,
            }).onConflictDoUpdate({
                target: premiumSubscriptions.userId,
                set: {
                    tierKey: resolvedTierKey,
                    billingCycle: input.billingCycle,
                    status: "active",
                    currentPeriodEnd: periodEnd,
                    cancelAtPeriodEnd: false,
                    cancelledAt: null,
                    failedAttempts: 0,
                },
            });

            await db.insert(premiumGifts).values({
                id: nanoid(),
                senderId: ctx.user.id,
                recipientId: input.recipientId,
                tierKey: input.tierKey,
                billingCycle: input.billingCycle,
                amountUsdc: Number(expected),
                txSignature: input.txSignature,
            });

            await syncPremiumBadge(input.recipientId, "individual");

            await createNotification({
                userId: input.recipientId,
                actorId: ctx.user.id,
                type: "system",
                body: `gifted you ${tier.name}!`,
            });

            return { success: true, tierKey: resolvedTierKey, periodEnd };
        }),
});
