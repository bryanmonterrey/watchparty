import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { router, botProcedure } from "@/server/trpc";
import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { developerBotInstalls } from "@/db/schema/content/developer-bot-install";
import {
    communityServers,
    communityMembers,
    communityChannels,
    communityMessages,
    communityAuditLog,
    communityCoinAlerts,
} from "@/db/schema/community";
import { COIN_FEED_KINDS } from "@/db/schema/content/coin-feed";
import { BOT_PERMISSIONS, hasPermission, permissionNames } from "@/lib/developer/bot-permissions";
import { DELETED_MESSAGE_TEXT } from "@/lib/community/constants";
import { botMemberId, notifyBotChannelChange } from "@/lib/developer/bot-community";
import { limitOrPass, messageSendLimiter } from "@/lib/rate-limit";

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
    // perm must be a real, single-or-combined capability bit. Guard perm === 0
    // explicitly: hasPermission(bits, 0) is vacuously true (bits & 0 === 0), so a
    // future capability that passed 0 here would be satisfied by ANY install row
    // — fail-closed on that programming error rather than silently granting.
    if (perm <= 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Unknown capability" });
    }
    const [row] = await db
        .select({ permissions: developerBotInstalls.permissions })
        .from(developerBotInstalls)
        .where(and(eq(developerBotInstalls.botUserId, botUserId), eq(developerBotInstalls.serverId, serverId)))
        .limit(1);
    if (!row || !hasPermission(row.permissions, perm)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This bot lacks that permission in this community" });
    }
}

/** Mirror of community.ts's fire-and-forget audit write. actorUserId is
 *  FK-less text by design ("system" precedent), so a bot user id is safe. */
function logBotAudit(serverId: string, botUserId: string, action: string, detail?: string) {
    return db.insert(communityAuditLog).values({ serverId, actorUserId: botUserId, action, detail }).catch(() => {});
}

/** botMemberId (lib/developer/bot-community.ts), translated to a tRPC error. */
async function requireBotMemberId(botUserId: string, serverId: string): Promise<string> {
    const id = await botMemberId(botUserId, serverId);
    if (!id) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Couldn't join the community" });
    }
    return id;
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

    /** Post a message into a channel. Requires SEND_MESSAGES in that channel's
     *  community. The serverId is DERIVED from the channel — a caller-supplied
     *  serverId would let a bot borrow one community's grant in another. */
    sendMessage: botProcedure
        .input(z.object({
            channelId: z.string().uuid(),
            // Same ceiling as the incoming-webhook path. The human tRPC path
            // has no max (pre-existing); the bot path does not copy that gap.
            content: z.string().trim().min(1).max(2000),
            replyToId: z.string().uuid().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const [channel] = await db
                .select({ id: communityChannels.id, serverId: communityChannels.serverId, type: communityChannels.type })
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);
            if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            if (channel.type !== "TEXT") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Bots can only post in text channels" });
            }
            await requireInstallPermission(ctx.bot.userId, channel.serverId, BOT_PERMISSIONS.SEND_MESSAGES);
            // Read-only (announcement) channels are deliberately allowed: the
            // install bitfield IS the admin's grant, and coin alerts into an
            // announcements channel is the headline use case. AutoMod is
            // skipped for the same reason — it exists to gate strangers, and
            // an installed bot was explicitly let in (and is revocable).

            // Per-channel throttle (10/10s) UNDER the per-bot 100/min ceiling
            // botProcedure already applies — a chatty bot can't flood one room.
            if (!(await limitOrPass(messageSendLimiter, `bot:${ctx.bot.userId}:${input.channelId}`))) {
                throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Slow down — 10 messages per 10 seconds per channel" });
            }

            const memberId = await requireBotMemberId(ctx.bot.userId, channel.serverId);

            // A reply target must live in the SAME channel — otherwise a bot
            // could surface a quote from a channel it has no business reading.
            if (input.replyToId) {
                const [target] = await db
                    .select({ id: communityMessages.id })
                    .from(communityMessages)
                    .where(and(eq(communityMessages.id, input.replyToId), eq(communityMessages.channelId, input.channelId)))
                    .limit(1);
                if (!target) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "replyToId is not a message in that channel" });
                }
            }

            const [msg] = await db
                .insert(communityMessages)
                .values({
                    channelId: input.channelId,
                    memberId,
                    content: input.content,
                    replyToId: input.replyToId ?? null,
                })
                .returning({ id: communityMessages.id, createdAt: communityMessages.createdAt });
            await notifyBotChannelChange(input.channelId);
            return { id: msg.id, channelId: input.channelId, createdAt: msg.createdAt };
        }),

    /** Soft-delete a message. Requires MODERATE in the message's community —
     *  which is derived from the message's own channel, never the caller
     *  (the human endpoint trusts a caller-supplied serverId; this one
     *  deliberately doesn't copy that). */
    deleteMessage: botProcedure
        .input(z.object({ messageId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [msg] = await db
                .select({
                    id: communityMessages.id,
                    channelId: communityMessages.channelId,
                    serverId: communityChannels.serverId,
                    deleted: communityMessages.deleted,
                })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityChannels.id, communityMessages.channelId))
                .where(eq(communityMessages.id, input.messageId))
                .limit(1);
            if (!msg) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
            await requireInstallPermission(ctx.bot.userId, msg.serverId, BOT_PERMISSIONS.MODERATE);
            if (!msg.deleted) {
                await db
                    .update(communityMessages)
                    .set({ deleted: true, content: DELETED_MESSAGE_TEXT, fileUrl: null, updatedAt: new Date() })
                    .where(eq(communityMessages.id, msg.id));
                await logBotAudit(msg.serverId, ctx.bot.userId, "bot.message.delete", `deleted message ${msg.id}`);
                await notifyBotChannelChange(msg.channelId);
            }
            return { success: true };
        }),

    /** Time out a member (mute-from-posting), or clear with duration 0.
     *  MODERATE. Only GUESTs can be timed out — never the owner or mods —
     *  and the permission check runs against the SAME serverId as the write,
     *  so a grant can't be borrowed across communities. */
    timeoutMember: botProcedure
        .input(z.object({
            serverId: z.string().uuid(),
            userId: z.string(),
            /** Seconds from now; 0 clears. Capped at 28 days (Discord's cap). */
            durationSeconds: z.number().int().min(0).max(28 * 86_400),
            reason: z.string().trim().max(200).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            await requireInstallPermission(ctx.bot.userId, input.serverId, BOT_PERMISSIONS.MODERATE);
            const [target] = await db
                .select({ id: communityMembers.id, role: communityMembers.role, isBot: user.isBot })
                .from(communityMembers)
                .innerJoin(user, eq(user.id, communityMembers.userId))
                .where(and(
                    eq(communityMembers.serverId, input.serverId),
                    eq(communityMembers.userId, input.userId),
                ))
                .limit(1);
            if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member of that community" });
            // Bots aren't timeout targets — their member rows are GUEST, but
            // the send path doesn't read timeoutUntil for bots; the real
            // levers are the permission bits and eviction (Bots panel).
            if (target.isBot) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Bots can't be timed out — remove their permissions or uninstall them instead" });
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
            await logBotAudit(
                input.serverId,
                ctx.bot.userId,
                "bot.member.timeout",
                timeoutUntil
                    ? `timed a member out until ${timeoutUntil.toISOString()}${input.reason ? ` — ${input.reason}` : ""}`
                    : "cleared a member's timeout",
            );
            return { userId: input.userId, timeoutUntil };
        }),

    // ── Coin alerts (MANAGE_COIN_ALERTS) ─────────────────────────────────
    // Standing "post here when this token does X" automations. Delivery rides
    // the coin-feed event write path (lib/coin-feed/community-alerts.ts) and
    // re-checks the grant at delivery time, so revoking the bit or evicting
    // the bot silences its alerts instantly.

    /** Create (or update the kinds of) a coin alert for a channel. */
    createCoinAlert: botProcedure
        .input(z.object({
            channelId: z.string().uuid(),
            tokenAddress: z.string().trim().min(32).max(64),
            /** Coin-feed kinds to alert on; empty/omitted = all kinds. */
            kinds: z.array(z.enum(COIN_FEED_KINDS)).max(COIN_FEED_KINDS.length).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const [channel] = await db
                .select({ id: communityChannels.id, serverId: communityChannels.serverId, type: communityChannels.type })
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);
            if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            if (channel.type !== "TEXT") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Coin alerts post into text channels" });
            }
            await requireInstallPermission(ctx.bot.userId, channel.serverId, BOT_PERMISSIONS.MANAGE_COIN_ALERTS);

            const [{ n }] = await db
                .select({ n: count() })
                .from(communityCoinAlerts)
                .where(eq(communityCoinAlerts.serverId, channel.serverId));
            if (n >= 25) {
                throw new TRPCError({ code: "FORBIDDEN", message: "This community is at its 25-alert limit" });
            }

            const kinds = input.kinds ?? [];
            const [row] = await db
                .insert(communityCoinAlerts)
                .values({
                    serverId: channel.serverId,
                    channelId: input.channelId,
                    tokenAddress: input.tokenAddress,
                    kinds,
                    createdByBotUserId: ctx.bot.userId,
                })
                .onConflictDoUpdate({
                    target: [
                        communityCoinAlerts.channelId,
                        communityCoinAlerts.tokenAddress,
                        communityCoinAlerts.createdByBotUserId,
                    ],
                    set: { kinds, updatedAt: new Date() },
                })
                .returning({ id: communityCoinAlerts.id });
            await logBotAudit(channel.serverId, ctx.bot.userId, "bot.coinalert.create", `alert on ${input.tokenAddress}`);
            return { id: row.id, channelId: input.channelId, tokenAddress: input.tokenAddress, kinds };
        }),

    /** This bot's alerts in a community. Requires the bit there. */
    listCoinAlerts: botProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireInstallPermission(ctx.bot.userId, input.serverId, BOT_PERMISSIONS.MANAGE_COIN_ALERTS);
            return db
                .select({
                    id: communityCoinAlerts.id,
                    channelId: communityCoinAlerts.channelId,
                    tokenAddress: communityCoinAlerts.tokenAddress,
                    kinds: communityCoinAlerts.kinds,
                    createdAt: communityCoinAlerts.createdAt,
                })
                .from(communityCoinAlerts)
                .where(and(
                    eq(communityCoinAlerts.serverId, input.serverId),
                    eq(communityCoinAlerts.createdByBotUserId, ctx.bot.userId),
                ));
        }),

    /** Delete one of this bot's alerts. serverId derived from the row. */
    deleteCoinAlert: botProcedure
        .input(z.object({ alertId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [row] = await db
                .select({
                    id: communityCoinAlerts.id,
                    serverId: communityCoinAlerts.serverId,
                    createdByBotUserId: communityCoinAlerts.createdByBotUserId,
                })
                .from(communityCoinAlerts)
                .where(eq(communityCoinAlerts.id, input.alertId))
                .limit(1);
            // Another bot's alert is invisible, not forbidden — don't leak ids.
            if (!row || row.createdByBotUserId !== ctx.bot.userId) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
            }
            await requireInstallPermission(ctx.bot.userId, row.serverId, BOT_PERMISSIONS.MANAGE_COIN_ALERTS);
            await db.delete(communityCoinAlerts).where(eq(communityCoinAlerts.id, row.id));
            return { success: true };
        }),
});
