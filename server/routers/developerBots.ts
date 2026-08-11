import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { developerApps } from "@/db/schema/content/developer-app";
import { developerBots } from "@/db/schema/content/developer-bot";
import { developerBotInstalls } from "@/db/schema/content/developer-bot-install";
import { communityServers, communityMembers } from "@/db/schema/community";
import { randHex } from "@/lib/api-gate";
import { mintBotToken } from "@/lib/developer/bot-auth";
import { sanitizePermissions, permissionNames } from "@/lib/developer/bot-permissions";
import { limitOrPass, webhookMutationLimiter } from "@/lib/rate-limit";

// Owner-facing bot management (console app-detail Bot tab). One bot per app.
// The bot is a real `user` row (is_bot = true) so it composes with chat and
// communities; developer_bots links it to the app and holds only the token
// hash. Tokens are view-once — create/reset return the plaintext exactly once.

async function ownedApp(userId: string, appId: string) {
    const [app] = await db
        .select({ id: developerApps.id, name: developerApps.name })
        .from(developerApps)
        .where(and(
            eq(developerApps.id, appId),
            eq(developerApps.ownerId, userId),
            isNull(developerApps.deletedAt),
        ))
        .limit(1);
    if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "App not found" });
    return app;
}

async function throttle(userId: string) {
    if (!(await limitOrPass(webhookMutationLimiter, userId))) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Wait a minute and try again" });
    }
}

// The bot userId for an app the caller owns, or throw. Composes the app-ownership
// check with "this app actually has a bot" so install endpoints get both gates.
async function ownedBotUserId(userId: string, appId: string): Promise<string> {
    await ownedApp(userId, appId);
    const [bot] = await db
        .select({ botUserId: developerBots.botUserId })
        .from(developerBots)
        .where(eq(developerBots.appId, appId))
        .limit(1);
    if (!bot) throw new TRPCError({ code: "NOT_FOUND", message: "This app has no bot yet" });
    return bot.botUserId;
}

// A bot may only be installed into / managed within a community the caller
// controls — its owner, or an ADMIN member. Installing a bot grants it standing
// scoped abilities in that community, so this is the consent gate: you can add a
// bot to a community you run, never to someone else's.
async function assertCommunityAdmin(userId: string, serverId: string) {
    const [srv] = await db
        .select({ ownerId: communityServers.ownerId })
        .from(communityServers)
        .where(eq(communityServers.id, serverId))
        .limit(1);
    if (!srv) throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
    if (srv.ownerId === userId) return;
    const [mem] = await db
        .select({ role: communityMembers.role })
        .from(communityMembers)
        .where(and(eq(communityMembers.serverId, serverId), eq(communityMembers.userId, userId)))
        .limit(1);
    if (mem?.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You must own or admin this community to manage its bots" });
    }
}

export const developerBotsRouter = router({
    /** The app's bot identity (no token), or null. */
    get: protectedProcedure
        .input(z.object({ appId: z.string() }))
        .query(async ({ ctx, input }) => {
            await ownedApp(ctx.user.id, input.appId);
            const [bot] = await db
                .select({ botUserId: developerBots.botUserId, createdAt: developerBots.createdAt })
                .from(developerBots)
                .where(eq(developerBots.appId, input.appId))
                .limit(1);
            if (!bot) return null;
            const [u] = await db
                .select({ name: user.name, username: user.username })
                .from(user)
                .where(eq(user.id, bot.botUserId))
                .limit(1);
            return { botUserId: bot.botUserId, name: u?.name ?? null, username: u?.username ?? null, createdAt: bot.createdAt };
        }),

    /** Create the app's bot (returns the token — shown once). */
    create: protectedProcedure
        .input(z.object({ appId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (!process.env.API_GATE_SECRET) {
                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The developer platform is not enabled" });
            }
            await throttle(ctx.user.id);
            const app = await ownedApp(ctx.user.id, input.appId);

            const [existing] = await db
                .select({ botUserId: developerBots.botUserId })
                .from(developerBots)
                .where(eq(developerBots.appId, input.appId))
                .limit(1);
            if (existing) throw new TRPCError({ code: "CONFLICT", message: "This app already has a bot" });

            const botUserId = `bot_${randHex(12)}`;
            const { keyId, token } = await mintBotToken();

            // One transaction: the bot user row and its developer_bots link land
            // together or not at all. Without this, a failure on the second insert
            // (or a race losing the unique app_id) would strand an is_bot user row
            // with no link — a ghost account squatting a username, invisible to the
            // owner. A real user row so the bot composes with chat/communities;
            // email is synthetic + unique; is_bot marks it (APP badge, never a login).
            await db.transaction(async (tx) => {
                await tx.insert(user).values({
                    id: botUserId,
                    name: `${app.name} bot`,
                    email: `bot-${botUserId}@bots.watchparty.xyz`,
                    emailVerified: true,
                    gender: false,
                    isBot: true,
                });
                await tx.insert(developerBots).values({
                    botUserId,
                    appId: input.appId,
                    ownerId: ctx.user.id,
                    keyId,
                });
            });
            return { botUserId, token };
        }),

    /** Roll the bot token — the old one stops working immediately. */
    resetToken: protectedProcedure
        .input(z.object({ appId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (!process.env.API_GATE_SECRET) {
                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The developer platform is not enabled" });
            }
            await throttle(ctx.user.id);
            await ownedApp(ctx.user.id, input.appId);
            const { keyId, token } = await mintBotToken();
            const updated = await db
                .update(developerBots)
                .set({ keyId })
                .where(and(eq(developerBots.appId, input.appId), eq(developerBots.ownerId, ctx.user.id)))
                .returning({ botUserId: developerBots.botUserId });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "No bot for this app" });
            return { token };
        }),

    /** Delete the bot (removes the bot user row too, via the FK cascade). */
    remove: protectedProcedure
        .input(z.object({ appId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const [bot] = await db
                .select({ botUserId: developerBots.botUserId })
                .from(developerBots)
                .where(and(eq(developerBots.appId, input.appId), eq(developerBots.ownerId, ctx.user.id)))
                .limit(1);
            if (!bot) throw new TRPCError({ code: "NOT_FOUND", message: "No bot for this app" });
            // Deleting the user row cascades to developer_bots (and anything the
            // bot authored), leaving no orphan identity behind.
            await db.delete(user).where(eq(user.id, bot.botUserId));
            return { success: true };
        }),

    // ─── Community installs (where the bot lives + what it may do) ───────────

    /** Communities the caller can install a bot into (owns, or is an ADMIN of). */
    installableCommunities: protectedProcedure.query(async ({ ctx }) => {
        const owned = await db
            .select({ id: communityServers.id, name: communityServers.name, imageUrl: communityServers.imageUrl })
            .from(communityServers)
            .where(eq(communityServers.ownerId, ctx.user.id));
        const adminOf = await db
            .select({ id: communityServers.id, name: communityServers.name, imageUrl: communityServers.imageUrl })
            .from(communityServers)
            .innerJoin(communityMembers, eq(communityMembers.serverId, communityServers.id))
            .where(and(eq(communityMembers.userId, ctx.user.id), eq(communityMembers.role, "ADMIN")));
        // Owner ∪ admin, deduped (an owner is often also a member row).
        const byId = new Map<string, { id: string; name: string; imageUrl: string | null }>();
        for (const c of [...owned, ...adminOf]) byId.set(c.id, c);
        return [...byId.values()];
    }),

    /** Where this app's bot is installed, with its permissions per community. */
    listInstalls: protectedProcedure
        .input(z.object({ appId: z.string() }))
        .query(async ({ ctx, input }) => {
            const botUserId = await ownedBotUserId(ctx.user.id, input.appId);
            const rows = await db
                .select({
                    serverId: developerBotInstalls.serverId,
                    permissions: developerBotInstalls.permissions,
                    createdAt: developerBotInstalls.createdAt,
                    name: communityServers.name,
                    imageUrl: communityServers.imageUrl,
                })
                .from(developerBotInstalls)
                .innerJoin(communityServers, eq(communityServers.id, developerBotInstalls.serverId))
                .where(eq(developerBotInstalls.botUserId, botUserId));
            return rows.map((r) => ({ ...r, permissionNames: permissionNames(r.permissions) }));
        }),

    /** Install the bot into a community (or update its permissions if present). */
    install: protectedProcedure
        .input(z.object({ appId: z.string(), serverId: z.string().uuid(), permissions: z.number().int().nonnegative() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const botUserId = await ownedBotUserId(ctx.user.id, input.appId);
            await assertCommunityAdmin(ctx.user.id, input.serverId);
            const permissions = sanitizePermissions(input.permissions);
            // Upsert on (bot, community): re-installing just resets permissions.
            await db
                .insert(developerBotInstalls)
                .values({ botUserId, serverId: input.serverId, permissions, installedBy: ctx.user.id })
                .onConflictDoUpdate({
                    target: [developerBotInstalls.botUserId, developerBotInstalls.serverId],
                    set: { permissions, updatedAt: new Date() },
                });
            return { permissions, permissionNames: permissionNames(permissions) };
        }),

    /** Change the bot's permissions in a community it's already in. */
    setPermissions: protectedProcedure
        .input(z.object({ appId: z.string(), serverId: z.string().uuid(), permissions: z.number().int().nonnegative() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const botUserId = await ownedBotUserId(ctx.user.id, input.appId);
            await assertCommunityAdmin(ctx.user.id, input.serverId);
            const permissions = sanitizePermissions(input.permissions);
            const updated = await db
                .update(developerBotInstalls)
                .set({ permissions, updatedAt: new Date() })
                .where(and(
                    eq(developerBotInstalls.botUserId, botUserId),
                    eq(developerBotInstalls.serverId, input.serverId),
                ))
                .returning({ id: developerBotInstalls.id });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "The bot is not installed in this community" });
            return { permissions, permissionNames: permissionNames(permissions) };
        }),

    /** Remove the bot from a community — it can do nothing there afterward. */
    uninstall: protectedProcedure
        .input(z.object({ appId: z.string(), serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const botUserId = await ownedBotUserId(ctx.user.id, input.appId);
            // No community-admin gate here on purpose: the app owner may always
            // pull their own bot out, even from a community they no longer admin.
            await db
                .delete(developerBotInstalls)
                .where(and(
                    eq(developerBotInstalls.botUserId, botUserId),
                    eq(developerBotInstalls.serverId, input.serverId),
                ));
            return { success: true };
        }),
});
