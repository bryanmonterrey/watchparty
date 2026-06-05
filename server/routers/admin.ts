import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { TRPCError } from "@trpc/server";
import { reports, verificationRequests } from "@/db/schema/content/moderation";
import { user } from "@/db/schema/auth";
import { posts } from "@/db/schema/content";
import { eq, desc, count, and, inArray } from "drizzle-orm";
import { deletePost } from "@/lib/typesense/sync";

// Admin-only middleware
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
    if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return next({ ctx });
});

export const adminRouter = router({
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
