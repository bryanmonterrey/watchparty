import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { db } from "@/db";
import { follows, pnlSnapshots, subscriptions, subscriptionTiers } from "@/db/schema/content";
import { user } from "@/db/schema/auth/user";
import { and, count, eq } from "drizzle-orm";
import { withCache } from "@/lib/cache";
import { computeBadges } from "@/server/lib/badges";
import type { EarnedBadge } from "@/lib/badges";

// The mini-profile popout + profile-header data source
// (docs/design-brief-2026-07.md §1). ONE batched query per user: identity,
// level/xp, earned badges, follow counts, PnL chip. The viewer-independent
// part is cached ~5 min under profile:card:{userId}; viewer state (isFollowing,
// isSubscribed) is joined fresh per request. updateProfile invalidates the key.

const CARD_TTL_SECONDS = 300;

interface CardCore {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    bio: string | null;
    verifiedTier: "verified" | "business" | "government" | null;
    affiliateUsername: string | null;
    affiliateIconUrl: string | null;
    createdAt: string | null;
    xp: number;
    level: number;
    badges: EarnedBadge[];
    followersCount: number;
    followingCount: number;
    /** Present only when the user shares trades — 7d realized for the chip. */
    pnl: { realizedUsd: number; winRate: number | null } | null;
    /** The user has at least one active creator sub tier → show Subscribe. */
    subscribable: boolean;
}

async function buildCardCore(target: typeof user.$inferSelect): Promise<CardCore> {
    const [followers, following, pnl, tiers, badges] = await Promise.all([
        db.select({ count: count() }).from(follows).where(eq(follows.followingId, target.id)),
        db.select({ count: count() }).from(follows).where(eq(follows.followerId, target.id)),
        target.shareTrades
            ? db.select({ realizedUsd: pnlSnapshots.realizedUsd, winRate: pnlSnapshots.winRate })
                .from(pnlSnapshots)
                .where(and(eq(pnlSnapshots.userId, target.id), eq(pnlSnapshots.window, "7d"))).limit(1)
            : Promise.resolve([]),
        db.select({ id: subscriptionTiers.id }).from(subscriptionTiers)
            .where(and(eq(subscriptionTiers.creatorId, target.id), eq(subscriptionTiers.isActive, true))).limit(1),
        computeBadges(target),
    ]);
    return {
        id: target.id,
        name: target.name,
        username: target.username,
        avatar_url: target.avatar_url,
        banner_url: target.banner_url,
        bio: target.bio,
        verifiedTier: target.verifiedTier,
        affiliateUsername: target.affiliateUsername,
        affiliateIconUrl: target.affiliateIconUrl,
        createdAt: target.createdAt ? target.createdAt.toISOString() : null,
        xp: target.xp,
        level: target.level,
        badges,
        followersCount: followers[0]?.count ?? 0,
        followingCount: following[0]?.count ?? 0,
        pnl: pnl.length ? { realizedUsd: pnl[0].realizedUsd, winRate: pnl[0].winRate } : null,
        subscribable: tiers.length > 0,
    };
}

export const profileRouter = router({
    /** Everything the popout/badge strip needs, one round trip. */
    card: publicProcedure
        .input(z.object({
            userId: z.string().optional(),
            username: z.string().optional(),
        }).refine((v) => v.userId || v.username, "userId or username is required"))
        .query(async ({ input, ctx }) => {
            const target = await db.query.user.findFirst({
                where: input.userId ? eq(user.id, input.userId) : eq(user.username, input.username!),
            });
            if (!target) throw new Error("User not found");

            const core = await withCache(`profile:card:${target.id}`, CARD_TTL_SECONDS, () => buildCardCore(target));

            const viewer = ctx.user;
            const [isFollowing, isSubscribed] = viewer && viewer.id !== target.id
                ? await Promise.all([
                    db.select({ id: follows.id }).from(follows)
                        .where(and(eq(follows.followerId, viewer.id), eq(follows.followingId, target.id))).limit(1)
                        .then((r) => r.length > 0),
                    db.select({ id: subscriptions.id }).from(subscriptions)
                        .where(and(
                            eq(subscriptions.subscriberId, viewer.id),
                            eq(subscriptions.creatorId, target.id),
                            eq(subscriptions.status, "active"),
                        )).limit(1)
                        .then((r) => r.length > 0),
                ])
                : [false, false];

            return { ...core, isFollowing, isSubscribed, isSelf: viewer?.id === target.id };
        }),
});
