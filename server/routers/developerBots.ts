import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { developerApps } from "@/db/schema/content/developer-app";
import { developerBots } from "@/db/schema/content/developer-bot";
import { randHex } from "@/lib/api-gate";
import { mintBotToken } from "@/lib/developer/bot-auth";
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
});
