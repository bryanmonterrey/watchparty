import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { TRPCError } from "@trpc/server";
import { reports, verificationRequests } from "@/db/schema/content/moderation";
import { user } from "@/db/schema/auth";
import { oauthClient } from "@/db/schema/auth";
import { posts } from "@/db/schema/content";
import { developerApps } from "@/db/schema/content/developer-app";
import { oauthScopeRequests } from "@/db/schema/content/oauth-scope-request";
import { trackedTokens } from "@/db/schema/content/coin-feed";
import { OAUTH_SCOPE_IDS } from "@/lib/developer/oauth-scopes";
import { eq, desc, count, and, inArray, gte, sql as dsql } from "drizzle-orm";
import { deletePost } from "@/lib/typesense/sync";
import { reviewCoinSpam } from "@/lib/coin-feed/spam-review";

// Admin-only middleware
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
    if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return next({ ctx });
});

export const adminRouter = router({
    /**
     * What the deterministic spam rules missed, over coins first seen recently.
     *
     * A MUTATION despite reading nothing, on purpose: it costs a Workers AI
     * call and tens of seconds, so it must fire on a click rather than on every
     * render, refetch, focus regain or retry that a query would bring.
     *
     * Proposals only — see lib/coin-feed/spam-review.ts for why the model is
     * kept out of the gate itself. Promoting a term is a code change to
     * `quality.ts`, reviewed like any other.
     */
    reviewCoinSpam: adminProcedure
        .input(z.object({ hours: z.number().min(1).max(168).default(24), limit: z.number().min(1).max(200).default(80) }))
        .mutation(async ({ input }) => {
            const rows = await db
                .select({
                    network: trackedTokens.network,
                    tokenAddress: trackedTokens.tokenAddress,
                    symbol: trackedTokens.symbol,
                    name: trackedTokens.name,
                    liquidityUsd: trackedTokens.liquidityUsd,
                    volume24hUsd: trackedTokens.volume24hUsd,
                    imageUrl: trackedTokens.imageUrl,
                })
                .from(trackedTokens)
                .where(gte(trackedTokens.firstSeenAt, dsql`now() - (${input.hours} || ' hours')::interval`))
                .orderBy(desc(trackedTokens.firstSeenAt))
                .limit(input.limit);

            const review = await reviewCoinSpam(rows);
            if (!review) {
                // Never fall back to an empty result — "couldn't review" and
                // "found nothing" must not look the same on a safety surface.
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Spam review unavailable (Workers AI unreachable or returned no usable JSON).",
                });
            }
            return review;
        }),

    // ─── Stats ───────────────────────────────────────────────────────────────

    getStats: adminProcedure.query(async () => {
        const [userCount, postCount, pendingReports, pendingVerifications] = await Promise.all([
            db.select({ count: count() }).from(user),
            db.select({ count: count() }).from(posts),
            db.select({ count: count() }).from(reports).where(eq(reports.status, "pending")),
            db.select({ count: count() }).from(verificationRequests).where(eq(verificationRequests.status, "pending")),
        ]);
        return {
            users: userCount[0]?.count ?? 0,
            posts: postCount[0]?.count ?? 0,
            pendingReports: pendingReports[0]?.count ?? 0,
            pendingVerifications: pendingVerifications[0]?.count ?? 0,
        };
    }),

    // ─── Reports ─────────────────────────────────────────────────────────────

    getReports: adminProcedure
        .input(z.object({
            status: z.enum(["pending", "reviewed", "resolved", "dismissed"]).optional(),
            limit: z.number().min(1).max(100).default(50),
            offset: z.number().default(0),
        }))
        .query(async ({ input }) => {
            const reporter = db.$with("reporter").as(
                db.select({ id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url })
                    .from(user)
            );
            const rows = await db
                .select({
                    id: reports.id,
                    reason: reports.reason,
                    details: reports.details,
                    status: reports.status,
                    createdAt: reports.createdAt,
                    targetPostId: reports.targetPostId,
                    targetUserId: reports.targetUserId,
                    reporterName: user.name,
                    reporterUsername: user.username,
                    reporterAvatar: user.avatar_url,
                })
                .from(reports)
                .innerJoin(user, eq(reports.reporterId, user.id))
                .where(input.status ? eq(reports.status, input.status) : undefined)
                .orderBy(desc(reports.createdAt))
                .limit(input.limit)
                .offset(input.offset);
            return rows;
        }),

    resolveReport: adminProcedure
        .input(z.object({
            reportId: z.string(),
            status: z.enum(["resolved", "dismissed"]),
        }))
        .mutation(async ({ ctx, input }) => {
            await db.update(reports).set({
                status: input.status,
                reviewedBy: ctx.user.id,
                reviewedAt: new Date(),
            }).where(eq(reports.id, input.reportId));
            return { success: true };
        }),

    // ─── Verification Queue ──────────────────────────────────────────────────

    getVerificationRequests: adminProcedure
        .input(z.object({
            status: z.enum(["pending", "approved", "rejected"]).optional().default("pending"),
        }))
        .query(async ({ input }) => {
            const rows = await db
                .select({
                    id: verificationRequests.id,
                    userId: verificationRequests.userId,
                    requestedTier: verificationRequests.requestedTier,
                    fullName: verificationRequests.fullName,
                    bio: verificationRequests.bio,
                    website: verificationRequests.website,
                    twitterHandle: verificationRequests.twitterHandle,
                    reason: verificationRequests.reason,
                    status: verificationRequests.status,
                    createdAt: verificationRequests.createdAt,
                    userName: user.name,
                    userUsername: user.username,
                    userAvatar: user.avatar_url,
                    userCreatedAt: user.createdAt,
                })
                .from(verificationRequests)
                .innerJoin(user, eq(verificationRequests.userId, user.id))
                .where(eq(verificationRequests.status, input.status))
                .orderBy(desc(verificationRequests.createdAt));
            return rows;
        }),

    reviewVerification: adminProcedure
        .input(z.object({
            requestId: z.string(),
            action: z.enum(["approve", "reject"]),
            rejectionReason: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const req = await db.select({ userId: verificationRequests.userId, requestedTier: verificationRequests.requestedTier })
                .from(verificationRequests)
                .where(eq(verificationRequests.id, input.requestId))
                .limit(1);
            if (!req[0]) throw new TRPCError({ code: "NOT_FOUND" });

            await db.update(verificationRequests).set({
                status: input.action === "approve" ? "approved" : "rejected",
                reviewedBy: ctx.user.id,
                reviewedAt: new Date(),
                rejectionReason: input.rejectionReason,
                updatedAt: new Date(),
            }).where(eq(verificationRequests.id, input.requestId));

            if (input.action === "approve") {
                await db.update(user).set({ verifiedTier: req[0].requestedTier }).where(eq(user.id, req[0].userId));
            }

            return { success: true };
        }),

    // ─── Privileged OAuth scope requests ─────────────────────────────────────
    // The Phase 11 "human review for privileged scopes" queue. Approval writes
    // the scope onto the app's oauthClient allow-list (standard scopes + every
    // granted privileged scope), which is the gate the OAuth provider enforces
    // at authorize. Inert until PRIVILEGED_SCOPE_IDS is non-empty.

    getScopeRequests: adminProcedure
        .input(z.object({
            status: z.enum(["pending", "approved", "rejected"]).optional().default("pending"),
        }))
        .query(async ({ input }) => {
            return db
                .select({
                    id: oauthScopeRequests.id,
                    appId: oauthScopeRequests.appId,
                    scope: oauthScopeRequests.scope,
                    reason: oauthScopeRequests.reason,
                    status: oauthScopeRequests.status,
                    createdAt: oauthScopeRequests.createdAt,
                    appName: developerApps.name,
                    ownerName: user.name,
                    ownerUsername: user.username,
                })
                .from(oauthScopeRequests)
                .innerJoin(developerApps, eq(oauthScopeRequests.appId, developerApps.id))
                .innerJoin(user, eq(oauthScopeRequests.userId, user.id))
                .where(eq(oauthScopeRequests.status, input.status))
                .orderBy(desc(oauthScopeRequests.createdAt));
        }),

    reviewScopeRequest: adminProcedure
        .input(z.object({
            requestId: z.string(),
            action: z.enum(["approve", "reject"]),
            rejectionReason: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const [req] = await db
                .select({ appId: oauthScopeRequests.appId, scope: oauthScopeRequests.scope, status: oauthScopeRequests.status })
                .from(oauthScopeRequests)
                .where(eq(oauthScopeRequests.id, input.requestId))
                .limit(1);
            if (!req) throw new TRPCError({ code: "NOT_FOUND" });
            if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Already reviewed" });

            await db.update(oauthScopeRequests).set({
                status: input.action === "approve" ? "approved" : "rejected",
                reviewedBy: ctx.user.id,
                reviewedAt: new Date(),
                rejectionReason: input.action === "reject" ? input.rejectionReason : null,
                updatedAt: new Date(),
            }).where(eq(oauthScopeRequests.id, input.requestId));

            if (input.action === "approve") {
                const [app] = await db
                    .select({ oauthClientId: developerApps.oauthClientId })
                    .from(developerApps)
                    .where(eq(developerApps.id, req.appId))
                    .limit(1);
                if (app?.oauthClientId) {
                    // The client's allow-list = the standard scopes every client
                    // gets + every APPROVED privileged scope for this app. Rebuilt
                    // from the source of truth so it's idempotent and self-heals.
                    const granted = await db
                        .select({ scope: oauthScopeRequests.scope })
                        .from(oauthScopeRequests)
                        .where(and(eq(oauthScopeRequests.appId, req.appId), eq(oauthScopeRequests.status, "approved")));
                    const scopes = [...new Set([...OAUTH_SCOPE_IDS, ...granted.map((g) => g.scope)])];
                    await db
                        .update(oauthClient)
                        .set({ scopes, updatedAt: new Date() })
                        .where(eq(oauthClient.clientId, app.oauthClientId));
                }
            }

            return { success: true };
        }),

    // ─── User Management ─────────────────────────────────────────────────────

    searchUsers: adminProcedure
        .input(z.object({ query: z.string().min(1) }))
        .query(async ({ input }) => {
            const { ilike, or } = await import("drizzle-orm");
            return db.select({
                id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url,
                role: user.role, verifiedTier: user.verifiedTier, createdAt: user.createdAt,
            }).from(user)
                .where(or(
                    ilike(user.username, `%${input.query}%`),
                    ilike(user.name, `%${input.query}%`),
                ))
                .limit(20);
        }),

    setUserRole: adminProcedure
        .input(z.object({ userId: z.string(), role: z.enum(["user", "moderator", "admin"]) }))
        .mutation(async ({ input }) => {
            await db.update(user).set({ role: input.role }).where(eq(user.id, input.userId));
            return { success: true };
        }),

    suspendUser: adminProcedure
        .input(z.object({ userId: z.string() }))
        .mutation(async ({ input }) => {
            await db.update(user).set({ role: "suspended" as string }).where(eq(user.id, input.userId));
            return { success: true };
        }),

    removePost: adminProcedure
        .input(z.object({ postId: z.string(), reason: z.string().optional() }))
        .mutation(async ({ input }) => {
            await db.update(posts).set({ status: "deleted" }).where(eq(posts.id, input.postId));
            deletePost(input.postId);
            return { success: true };
        }),
});
