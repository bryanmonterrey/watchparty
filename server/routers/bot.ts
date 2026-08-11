import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, botProcedure } from "@/server/trpc";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { developerBotInstalls } from "@/db/schema/content/developer-bot-install";
import { communityServers, communityMembers } from "@/db/schema/community";
import { BOT_PERMISSIONS, hasPermission, permissionNames } from "@/lib/developer/bot-permissions";

// Bot-FACING endpoints — reached with `Authorization: Bot <token>`, never a
// user session. A bot can do NOTHING that isn't opted in here as a botProcedure,
// and nothing in a community it isn't installed in: `requireInstallPermission`
// is the second gate after the token, checking the per-community bitfield.
// Capabilities that WRITE get added the same way, one botProcedure at a time.

// Load the bot's install row for a community and assert it grants `perm`. A bot
// with no install row, or one missing the bit, is refused — fail-closed, same
// posture as the token auth. Also confirms the community still exists (the FK
// cascade removes installs when a community is deleted, so a stale serverId
// simply has no row).
async function requireInstallPermission(botUserId: string, serverId: string, perm: number) {
    const [row] = await db
        .select({ permissions: developerBotInstalls.permissions })
        .from(developerBotInstalls)
        .where(and(eq(developerBotInstalls.botUserId, botUserId), eq(developerBotInstalls.serverId, serverId)))
        .limit(1);
    if (!row || !hasPermission(row.permissions, perm)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This bot lacks that permission in this community" });
    }
}

export const botRouter = router({
    /** Who am I? Identity of the authenticated bot. */
    whoami: botProcedure.query(async ({ ctx }) => {
        const [row] = await db
            .select({ id: user.id, name: user.name, username: user.username, avatar_url: user.avatar_url })
            .from(user)
            .where(eq(user.id, ctx.bot.userId))
            .limit(1);
        return {
            botUserId: ctx.bot.userId,
            appId: ctx.bot.appId,
            name: row?.name ?? null,
            username: row?.username ?? null,
            avatarUrl: row?.avatar_url ?? null,
        };
    }),

    /** Which communities am I installed in, and what may I do in each? */
    installs: botProcedure.query(async ({ ctx }) => {
        const rows = await db
            .select({
                serverId: developerBotInstalls.serverId,
                permissions: developerBotInstalls.permissions,
                name: communityServers.name,
            })
            .from(developerBotInstalls)
            .innerJoin(communityServers, eq(communityServers.id, developerBotInstalls.serverId))
            .where(eq(developerBotInstalls.botUserId, ctx.bot.userId));
        return rows.map((r) => ({
            serverId: r.serverId,
            name: r.name,
            permissions: r.permissions,
            permissionNames: permissionNames(r.permissions),
        }));
    }),

    /** Read a community's member roster. Requires READ_MEMBERS in that community. */
    listMembers: botProcedure
        .input(z.object({ serverId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(50) }))
        .query(async ({ ctx, input }) => {
            await requireInstallPermission(ctx.bot.userId, input.serverId, BOT_PERMISSIONS.READ_MEMBERS);
            return db
                .select({
                    userId: communityMembers.userId,
                    role: communityMembers.role,
                    nickname: communityMembers.nickname,
                    name: user.name,
                    username: user.username,
                })
                .from(communityMembers)
                .innerJoin(user, eq(user.id, communityMembers.userId))
                .where(eq(communityMembers.serverId, input.serverId))
                .limit(input.limit);
        }),
});
