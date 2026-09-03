import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { referrals, referralEarnings } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, count, desc, and, isNull, inArray, sql, ne, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { payoutDestinationFor } from "@/server/lib/user-wallet";
import {
    APPLY_REJECTION_MESSAGE,
    REF_INPUT_MAX,
    applicantRejection,
    canClaimUsernameSlug,
    linkSlugFor,
    normalizeRefInput,
    pairRejection,
    resolveReferrer,
} from "@/lib/referral/rules";

// The rules (what a link is, how it resolves, who may apply one) live in
// lib/referral/rules.ts and are unit-tested; this file is the DB glue.

// 6 upper-case alphanumerics — the legacy link form and the fallback for
// accounts without a username.
function generateReferralCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// drizzle wraps driver errors in DrizzleQueryError; the postgres code is on .cause.
function isUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; cause?: { code?: string } } | null;
    return e?.code === "23505" || e?.cause?.code === "23505";
}

async function loadLinkFields(userId: string) {
    const [row] = await db
        .select({ referralCode: user.referralCode, referralSlug: user.referralSlug, username: user.username })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1);
    return row ?? { referralCode: null, referralSlug: null, username: null };
}

/**
 * Assign a code if the row has none. Safe under concurrency: the UPDATE is
 * conditioned on the column still being NULL and the unique index rejects a
 * collision with another user, so we just re-read and return whatever won.
 */
async function ensureCode(userId: string, current: string | null): Promise<string> {
    if (current) return current;
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            await db
                .update(user)
                .set({ referralCode: generateReferralCode() })
                .where(and(eq(user.id, userId), isNull(user.referralCode)));
        } catch (err) {
            if (isUniqueViolation(err)) continue;
            throw err;
        }
        const [row] = await db.select({ referralCode: user.referralCode }).from(user).where(eq(user.id, userId)).limit(1);
        if (row?.referralCode) return row.referralCode;
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't generate a referral code, try again" });
}

/**
 * Claim `username` as the permanent slug if the account has none yet. A
 * unique violation means someone else's link already uses that name (they
 * held it before this user did) — the account stays on its code. Returns the
 * slug in effect afterwards.
 */
async function claimSlugIfUnset(userId: string, username: string): Promise<string | null> {
    try {
        const rows = await db
            .update(user)
            .set({ referralSlug: username })
            .where(and(eq(user.id, userId), isNull(user.referralSlug)))
            .returning({ slug: user.referralSlug });
        if (rows[0]?.slug) return rows[0].slug;
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
    }
    const [row] = await db.select({ slug: user.referralSlug }).from(user).where(eq(user.id, userId)).limit(1);
    return row?.slug ?? null;
}

async function slugHeldByOther(slug: string, userId: string): Promise<boolean> {
    const [row] = await db
        .select({ id: user.id })
        .from(user)
        .where(and(sql`lower(${user.referralSlug}) = ${slug.toLowerCase()}`, ne(user.id, userId)))
        .limit(1);
    return !!row;
}

type ReferrerRow = { id: string; referredBy: string | null; isBot: boolean };
async function findReferrer(where: SQL): Promise<ReferrerRow | null> {
    const [row] = await db
        .select({ id: user.id, referredBy: user.referredBy, isBot: user.isBot })
        .from(user)
        .where(where)
        .limit(1);
    return row ?? null;
}

export const referralRouter = router({
    /**
     * The caller's link. Generates the code on first call and, when the
     * account has a username and no slug yet, claims the username as the
     * permanent slug. The link is `/?ref=<slug ?? code>`.
     */
    getMyCode: protectedProcedure.query(async ({ ctx }) => {
        const me = await loadLinkFields(ctx.user.id);
        const code = await ensureCode(ctx.user.id, me.referralCode);
        let slug = me.referralSlug;
        if (!slug && me.username) slug = await claimSlugIfUnset(ctx.user.id, me.username);

        const usernameTakenByOther = me.username ? await slugHeldByOther(me.username, ctx.user.id) : false;
        return {
            code,
            slug,
            username: me.username ?? null,
            /** What goes after `?ref=` — the slug, else the code. */
            linkSlug: linkSlugFor({ referralSlug: slug, referralCode: code }) ?? code,
            /** The account was renamed and the new name is free: offer to move the link. */
            canClaimUsername: canClaimUsernameSlug({ username: me.username, referralSlug: slug, usernameTakenByOtherSlug: usernameTakenByOther }),
            /** The current username is already someone else's link (they held it first). */
            usernameTakenByOther,
        };
    }),

    /**
     * Move the link to the current username. Deliberate and explicit — the UI
     * warns that links already shared under the old slug stop working.
     */
    claimUsernameSlug: protectedProcedure.mutation(async ({ ctx }) => {
        const me = await loadLinkFields(ctx.user.id);
        if (!me.username) throw new TRPCError({ code: "BAD_REQUEST", message: "Set a username first" });
        if (me.referralSlug?.toLowerCase() === me.username.toLowerCase()) return { slug: me.referralSlug };
        try {
            await db.update(user).set({ referralSlug: me.username }).where(eq(user.id, ctx.user.id));
        } catch (err) {
            if (isUniqueViolation(err)) {
                throw new TRPCError({ code: "CONFLICT", message: "That name is already used by another referral link" });
            }
            throw err;
        }
        return { slug: me.username };
    }),

    /** Apply a referral from a link (`?ref=`) or typed by hand: slug, username or code. */
    applyCode: protectedProcedure
        .input(z.object({ code: z.string().min(1).max(REF_INPUT_MAX * 2) }))
        .mutation(async ({ ctx, input }) => {
            const ref = normalizeRefInput(input.code);
            if (!ref) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a username or referral code" });

            const [me] = await db
                .select({ id: user.id, referredBy: user.referredBy, createdAt: user.createdAt, isBot: user.isBot })
                .from(user)
                .where(eq(user.id, ctx.user.id))
                .limit(1);
            if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });

            const applicantProblem = applicantRejection(me);
            if (applicantProblem) throw new TRPCError({ code: "BAD_REQUEST", message: APPLY_REJECTION_MESSAGE[applicantProblem] });

            const referrer = await resolveReferrer<ReferrerRow>(ref, {
                bySlug: (s) => findReferrer(sql`lower(${user.referralSlug}) = ${s}`),
                byUsername: (s) => findReferrer(sql`lower(${user.username}) = ${s}`),
                byCode: (c) => findReferrer(eq(user.referralCode, c)),
            });
            if (!referrer) throw new TRPCError({ code: "NOT_FOUND", message: "We couldn't find that referral link or code" });

            const pairProblem = pairRejection(me, referrer);
            if (pairProblem) throw new TRPCError({ code: "BAD_REQUEST", message: APPLY_REJECTION_MESSAGE[pairProblem] });

            // Record referral. The unique index on referredUserId plus the
            // NULL-conditioned update make a double-submit a no-op.
            await db.insert(referrals).values({
                id: nanoid(),
                referrerId: referrer.id,
                referredUserId: ctx.user.id,
                status: "completed",
                rewardLamports: 0,
                completedAt: new Date(),
            }).onConflictDoNothing();

            await db
                .update(user)
                .set({ referredBy: referrer.id })
                .where(and(eq(user.id, ctx.user.id), isNull(user.referredBy)));

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
        const wallet = await payoutDestinationFor(ctx.user.id, ctx.user.wallet_address);
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
