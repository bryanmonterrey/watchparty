import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { communityServers, communityMembers, communityAuditLog } from "@/db/schema/community";
import { user } from "@/db/schema/auth/user";

// Human moderation actions that arrived AFTER server/routers/community.ts hit
// its file-size-guard cap — new mod surface lands here. Same conventions:
// role-gated, audited via community_audit_log (actorUserId is FK-less text).

async function requireModRole(serverId: string, userId: string): Promise<void> {
    const [srv] = await db
        .select({ ownerId: communityServers.ownerId })
        .from(communityServers)
        .where(eq(communityServers.id, serverId))
        .limit(1);
    if (!srv) throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
    if (srv.ownerId === userId) return;
    const [me] = await db
        .select({ role: communityMembers.role })
        .from(communityMembers)
        .where(and(eq(communityMembers.serverId, serverId), eq(communityMembers.userId, userId)))
        .limit(1);
    if (!me || (me.role !== "ADMIN" && me.role !== "MODERATOR")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Moderators only" });
    }
}

export const communityModerationRouter = router({
    /** Time out a member (mute-from-posting) or clear with duration 0.
     *  Owner/ADMIN/MODERATOR may act; only GUESTs can be targets (matching
     *  bot.timeoutMember — no mod-vs-mod wars, never the owner, never bots).
     *  Enforcement lives in the send paths via member.timeout_until. */
    timeoutMember: protectedProcedure
        .input(z.object({
            serverId: z.string().uuid(),
            userId: z.string(),
            /** Seconds from now; 0 clears. Capped at 28 days. */
            durationSeconds: z.number().int().min(0).max(28 * 86_400),
            reason: z.string().trim().max(200).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            await requireModRole(input.serverId, ctx.user.id);
            if (input.userId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "You can't time yourself out" });
            }
            const [target] = await db
                .select({ id: communityMembers.id, role: communityMembers.role, isBot: user.isBot, name: user.name })
                .from(communityMembers)
                .innerJoin(user, eq(user.id, communityMembers.userId))
                .where(and(
                    eq(communityMembers.serverId, input.serverId),
                    eq(communityMembers.userId, input.userId),
                ))
                .limit(1);
            if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member of this community" });
            if (target.isBot) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Bots can't be timed out — manage them from Server Settings → Integrations" });
            }
            const [srv] = await db
                .select({ ownerId: communityServers.ownerId })
                .from(communityServers)
                .where(eq(communityServers.id, input.serverId))
                .limit(1);
            if (srv?.ownerId === input.userId || target.role !== "GUEST") {
                throw new TRPCError({ code: "FORBIDDEN", message: "Only regular members can be timed out" });
            }
            const timeoutUntil =
                input.durationSeconds > 0 ? new Date(Date.now() + input.durationSeconds * 1000) : null;
            await db
                .update(communityMembers)
                .set({ timeoutUntil, updatedAt: new Date() })
                .where(eq(communityMembers.id, target.id));
            await db.insert(communityAuditLog).values({
                serverId: input.serverId,
                actorUserId: ctx.user.id,
                action: "member.timeout",
                detail: timeoutUntil
                    ? `timed out ${target.name ?? "a member"} until ${timeoutUntil.toISOString()}${input.reason ? ` — ${input.reason}` : ""}`
                    : `cleared the timeout on ${target.name ?? "a member"}`,
            }).catch(() => {});
            return { userId: input.userId, timeoutUntil };
        }),
});
