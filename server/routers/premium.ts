import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { premiumPlans, premiumSubscriptions, premiumLeads } from "@/db/schema/content";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import {
    TIERS,
    type TierKey,
    type BillingCycle,
    priceUsd,
    formatUsd,
} from "@/lib/premium/tiers";
import { chargeSubscriber } from "@/lib/chains/solana/subscriptions/collector";

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
    getStatus: protectedProcedure.query(async ({ ctx }) => {
        const [row] = await db
            .select()
            .from(premiumSubscriptions)
            .where(eq(premiumSubscriptions.userId, ctx.user.id))
            .limit(1);

        if (!row) return { entitled: false as const, subscription: null };

        const active =
            (row.status === "active" || row.status === "past_due") &&
            row.currentPeriodEnd.getTime() > Date.now();

        return {
            entitled: active,
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
});
