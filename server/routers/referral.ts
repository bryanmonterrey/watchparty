import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { db } from "@/db";
import { referrals, referralEarnings } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, count, desc, and, isNull, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

// Simple alphanumeric referral code generator
function generateReferralCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const referralRouter = router({
    // Get or generate the current user's referral code. The shareable link
    // uses the USERNAME when one exists (watchparty.xyz/?ref=bry) — the code
    // is the fallback for accounts without a username, and legacy codes keep
    // working because applyCode matches both.
    getMyCode: protectedProcedure.query(async ({ ctx }) => {
        const [u] = await db.select({ referralCode: user.referralCode, username: user.username })
            .from(user)
            .where(eq(user.id, ctx.user.id))
            .limit(1);

        if (u?.referralCode) return { code: u.referralCode, username: u.username ?? null };

        // Generate a unique code
        let code = generateReferralCode();
        let attempts = 0;
        while (attempts < 5) {
            const existing = await db.select({ id: user.id })
                .from(user).where(eq(user.referralCode, code)).limit(1);
            if (!existing.length) break;
            code = generateReferralCode();
            attempts++;
        }

        await db.update(user).set({ referralCode: code }).where(eq(user.id, ctx.user.id));
        const [me] = await db.select({ username: user.username }).from(user).where(eq(user.id, ctx.user.id)).limit(1);
        return { code, username: me?.username ?? null };
    }),

    // Apply a referral (code or username — links carry the username)
    applyCode: protectedProcedure
        .input(z.object({ code: z.string().min(2).max(40) }))
        .mutation(async ({ ctx, input }) => {
            // Check user hasn't already been referred
            const [me] = await db.select({ referredBy: user.referredBy })
                .from(user).where(eq(user.id, ctx.user.id)).limit(1);
            if (me?.referredBy) throw new TRPCError({ code: "BAD_REQUEST", message: "Already applied a referral code" });

            // Find the referrer: legacy code first, then username
            let [referrer] = await db.select({ id: user.id })
                .from(user).where(eq(user.referralCode, input.code.toUpperCase())).limit(1);
            if (!referrer) {
                [referrer] = await db.select({ id: user.id })
                    .from(user).where(eq(user.username, input.code.toLowerCase())).limit(1);
            }
            if (!referrer) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid referral code" });
            if (referrer.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot refer yourself" });

            // Record referral
            await db.insert(referrals).values({
                id: nanoid(),
                referrerId: referrer.id,
                referredUserId: ctx.user.id,
                status: "completed",
                rewardLamports: 0, // set reward amount here when implemented
                completedAt: new Date(),
            }).onConflictDoNothing();

            // Mark the referred user
            await db.update(user).set({ referredBy: referrer.id }).where(eq(user.id, ctx.user.id));

            return { success: true };
        }),

    // Get my referral stats
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const [me] = await db.select({ referralCode: user.referralCode })
            .from(user).where(eq(user.id, ctx.user.id)).limit(1);

        const rows = await db.select({
            id: referrals.id,
            status: referrals.status,
            rewardLamports: referrals.rewardLamports,
            completedAt: referrals.completedAt,
            createdAt: referrals.createdAt,
            referredUser: {
                id: user.id,
                name: user.name,
                username: user.username,
                avatar_url: user.avatar_url,
            },
        })
            .from(referrals)
            .innerJoin(user, eq(referrals.referredUserId, user.id))
            .where(eq(referrals.referrerId, ctx.user.id))
            .orderBy(desc(referrals.createdAt));

        const [totals] = await db.select({ total: count() })
            .from(referrals)
            .where(eq(referrals.referrerId, ctx.user.id));

        return {
            code: me?.referralCode ?? null,
            referrals: rows,
            totalReferrals: totals?.total ?? 0,
        };
    }),

    // ─── Rewards: 10% of referred users' premium payments (12 months) ───

    getEarnings: protectedProcedure.query(async ({ ctx }) => {
        const rows = await db
            .select({
                id: referralEarnings.id,
                amountUsdc: referralEarnings.amountUsdc,
                source: referralEarnings.source,
                claimedAt: referralEarnings.claimedAt,
                createdAt: referralEarnings.createdAt,
                referredUsername: user.username,
                referredName: user.name,
            })
            .from(referralEarnings)
            .leftJoin(user, eq(referralEarnings.referredUserId, user.id))
            .where(eq(referralEarnings.referrerId, ctx.user.id))
            .orderBy(desc(referralEarnings.createdAt))
            .limit(50);

        let claimable = BigInt(0);
        let lifetime = BigInt(0);
        const [sums] = await db
            .select({
                claimable: sql<string>`COALESCE(SUM(CASE WHEN ${referralEarnings.claimedAt} IS NULL THEN ${referralEarnings.amountUsdc} ELSE 0 END), 0)`,
                lifetime: sql<string>`COALESCE(SUM(${referralEarnings.amountUsdc}), 0)`,
            })
            .from(referralEarnings)
            .where(eq(referralEarnings.referrerId, ctx.user.id));
        claimable = BigInt(sums?.claimable ?? "0");
        lifetime = BigInt(sums?.lifetime ?? "0");

        return {
            claimableUsdc: claimable.toString(),
            lifetimeUsdc: lifetime.toString(),
            rows: rows.map((r) => ({ ...r, amountUsdc: r.amountUsdc.toString() })),
        };
    }),

    /** Pay all unclaimed earnings to the caller's wallet from the treasury. */
    claimEarnings: protectedProcedure.mutation(async ({ ctx }) => {
        const wallet = ctx.user.wallet_address;
        if (!wallet) throw new TRPCError({ code: "BAD_REQUEST", message: "Link a wallet to receive your payout" });

        // Claim-once gate BEFORE moving money: stamp the unclaimed rows; a
        // concurrent claim gets zero rows here and stops.
        const claimed = await db
            .update(referralEarnings)
            .set({ claimedAt: new Date() })
            .where(and(eq(referralEarnings.referrerId, ctx.user.id), isNull(referralEarnings.claimedAt)))
            .returning({ id: referralEarnings.id, amountUsdc: referralEarnings.amountUsdc });
        if (claimed.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to claim yet" });

        const total = claimed.reduce((s, r) => s + r.amountUsdc, BigInt(0));
        const ids = claimed.map((r) => r.id);
        try {
            const { transferUsdcFromTreasury } = await import("@/lib/chains/solana/subscriptions/collector");
            const sig = await transferUsdcFromTreasury(wallet, total);
            await db.update(referralEarnings).set({ claimSignature: sig }).where(inArray(referralEarnings.id, ids));
            return { amountUsdc: total.toString(), signature: sig };
        } catch (err) {
            // roll the gate back — nothing was paid
            await db.update(referralEarnings).set({ claimedAt: null }).where(inArray(referralEarnings.id, ids));
            console.error("referral claim payout failed:", err);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payout failed — nothing was deducted, try again" });
        }
    }),
});
