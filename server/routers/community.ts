import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { db } from "@/db";
import {
    communityServers,
    communityMembers,
    communityChannels,
    communityMessages,
    communityChannelReads,
} from "@/db/schema/community";
import { user } from "@/db/schema";
import { eq, and, desc, asc, sql, lt, ne, count } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { publishToRoom } from "@/lib/realtime/publish";
import { rooms } from "@/lib/realtime/protocol";

/** Notify connected clients that a channel's messages changed → they refetch. */
function notifyChannelChange(channelId: string) {
    return publishToRoom(rooms.communityChannel(channelId), {
        t: "event",
        name: "message-change",
        payload: null,
    });
}

export const communityRouter = router({
    // ─── Server CRUD ─────────────────────────────────────

    /** List servers the current user belongs to */
    listServers: protectedProcedure.query(async ({ ctx }) => {
        const servers = await db
            .select({
                id: communityServers.id,
                name: communityServers.name,
                imageUrl: communityServers.imageUrl,
                inviteCode: communityServers.inviteCode,
                ownerId: communityServers.ownerId,
                createdAt: communityServers.createdAt,
            })
            .from(communityServers)
            .innerJoin(communityMembers, eq(communityServers.id, communityMembers.serverId))
            .where(eq(communityMembers.userId, ctx.user.id))
            .orderBy(asc(communityServers.createdAt));

        // Unread flag per server: any channel message newer than the member's
        // read marker (missing marker = everything unread), not their own.
        const unreadServers = await db
            .selectDistinct({ serverId: communityChannels.serverId })
            .from(communityMessages)
            .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
            .innerJoin(communityMembers, and(
                eq(communityMembers.serverId, communityChannels.serverId),
                eq(communityMembers.userId, ctx.user.id),
            ))
            .leftJoin(communityChannelReads, and(
                eq(communityChannelReads.channelId, communityChannels.id),
                eq(communityChannelReads.memberId, communityMembers.id),
            ))
            .where(and(
                ne(communityMessages.memberId, communityMembers.id),
                eq(communityMessages.deleted, false),
                sql`${communityMessages.createdAt} > COALESCE(${communityChannelReads.lastReadAt}, 'epoch'::timestamptz)`,
            ));
        const unreadSet = new Set(unreadServers.map((r) => r.serverId));

        return servers.map((s) => ({ ...s, hasUnread: unreadSet.has(s.id) }));
    }),

    /** Get a server by ID with channels + members */
    getServer: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Verify membership
            const membership = await db
                .select()
                .from(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, input.serverId),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!membership.length) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this server" });
            }

            const server = await db
                .select()
                .from(communityServers)
                .where(eq(communityServers.id, input.serverId))
                .limit(1);

            if (!server.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
            }

            const channels = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.serverId, input.serverId))
                .orderBy(sql`${communityChannels.position} ASC NULLS LAST`, asc(communityChannels.createdAt));

            // Unread count per channel for the current member.
            const unreadRows = await db
                .select({ channelId: communityMessages.channelId, cnt: count() })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .leftJoin(communityChannelReads, and(
                    eq(communityChannelReads.channelId, communityMessages.channelId),
                    eq(communityChannelReads.memberId, membership[0].id),
                ))
                .where(and(
                    eq(communityChannels.serverId, input.serverId),
                    ne(communityMessages.memberId, membership[0].id),
                    eq(communityMessages.deleted, false),
                    sql`${communityMessages.createdAt} > COALESCE(${communityChannelReads.lastReadAt}, 'epoch'::timestamptz)`,
                ))
                .groupBy(communityMessages.channelId);
            const unreadByChannel = new Map(unreadRows.map((r) => [r.channelId, Number(r.cnt)]));
            const channelsWithUnread = channels.map((c) => ({ ...c, unreadCount: unreadByChannel.get(c.id) ?? 0 }));

            const members = await db
                .select({
                    id: communityMembers.id,
                    role: communityMembers.role,
                    userId: communityMembers.userId,
                    serverId: communityMembers.serverId,
                    createdAt: communityMembers.createdAt,
                    userName: user.name,
                    userImage: user.avatar_url,
                    userUsername: user.username,
                })
                .from(communityMembers)
                .innerJoin(user, eq(communityMembers.userId, user.id))
                .where(eq(communityMembers.serverId, input.serverId))
                .orderBy(asc(communityMembers.role));

            return {
                server: server[0],
                channels: channelsWithUnread,
                members,
                currentMember: membership[0],
            };
        }),

    /** Create a new server */
    createServer: protectedProcedure
        .input(
            z.object({
                name: z.string().min(1).max(100),
                imageUrl: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const inviteCode = nanoid(8);

            const [newServer] = await db
                .insert(communityServers)
                .values({
                    name: input.name,
                    imageUrl: input.imageUrl ?? null,
                    inviteCode,
                    ownerId: ctx.user.id,
                })
                .returning();

            // Add owner as ADMIN member
            await db.insert(communityMembers).values({
                userId: ctx.user.id,
                serverId: newServer.id,
                role: "ADMIN",
            });

            // Create default #general channel
            await db.insert(communityChannels).values({
                name: "general",
                type: "TEXT",
                serverId: newServer.id,
                createdById: ctx.user.id,
            });

            return newServer;
        }),

    /** Update server */
    updateServer: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                name: z.string().min(1).max(100).optional(),
                imageUrl: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            const [updated] = await db
                .update(communityServers)
                .set({
                    ...(input.name && { name: input.name }),
                    ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
                    updatedAt: new Date(),
                })
                .where(eq(communityServers.id, input.serverId))
                .returning();

            return updated;
        }),

    /** Delete server */
    deleteServer: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            await db.delete(communityServers).where(eq(communityServers.id, input.serverId));
            return { success: true };
        }),

    /** Generate new invite code */
    generateInviteCode: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const newCode = nanoid(8);
            const [updated] = await db
                .update(communityServers)
                .set({ inviteCode: newCode, updatedAt: new Date() })
                .where(eq(communityServers.id, input.serverId))
                .returning();

            return { inviteCode: updated.inviteCode };
        }),

    /** Join a server via invite code */
    joinServer: protectedProcedure
        .input(z.object({ inviteCode: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const server = await db
                .select()
                .from(communityServers)
                .where(eq(communityServers.inviteCode, input.inviteCode))
                .limit(1);

            if (!server.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite code" });
            }

            // Check if already a member
            const existing = await db
                .select()
                .from(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, server[0].id),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (existing.length) {
                return { serverId: server[0].id, alreadyMember: true };
            }

            await db.insert(communityMembers).values({
                userId: ctx.user.id,
                serverId: server[0].id,
                role: "GUEST",
            });

            return { serverId: server[0].id, alreadyMember: false };
        }),

    /** Leave a server */
    leaveServer: protectedProcedure
        .input(z.object({ serverId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const server = await db
                .select()
                .from(communityServers)
                .where(eq(communityServers.id, input.serverId))
                .limit(1);

            if (server.length && server[0].ownerId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Owner cannot leave the server" });
            }

            await db
                .delete(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, input.serverId),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                );

            return { success: true };
        }),

    /** Update member role */
    updateMemberRole: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                memberId: z.string().uuid(),
                role: z.enum(["ADMIN", "MODERATOR", "GUEST"]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            const [updated] = await db
                .update(communityMembers)
                .set({ role: input.role, updatedAt: new Date() })
                .where(eq(communityMembers.id, input.memberId))
                .returning();

            return updated;
        }),

    /** Kick member */
    kickMember: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                memberId: z.string().uuid(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN");

            // Prevent kicking yourself
            const target = await db
                .select()
                .from(communityMembers)
                .where(eq(communityMembers.id, input.memberId))
                .limit(1);

            if (target.length && target[0].userId === ctx.user.id) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot kick yourself" });
            }

            await db.delete(communityMembers).where(eq(communityMembers.id, input.memberId));
            return { success: true };
        }),

    // ─── Channel CRUD ────────────────────────────────────

    /** Create a channel */
    createChannel: protectedProcedure
        .input(
            z.object({
                serverId: z.string().uuid(),
                name: z.string().min(1).max(100),
                type: z.enum(["TEXT", "AUDIO", "VIDEO"]).default("TEXT"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [channel] = await db
                .insert(communityChannels)
                .values({
                    name: input.name.toLowerCase().replace(/\s+/g, "-"),
                    type: input.type,
                    serverId: input.serverId,
                    createdById: ctx.user.id,
                })
                .returning();

            return channel;
        }),

    /** Update a channel */
    updateChannel: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                serverId: z.string().uuid(),
                name: z.string().min(1).max(100).optional(),
                type: z.enum(["TEXT", "AUDIO", "VIDEO"]).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            const [updated] = await db
                .update(communityChannels)
                .set({
                    ...(input.name && { name: input.name.toLowerCase().replace(/\s+/g, "-") }),
                    ...(input.type && { type: input.type }),
                    updatedAt: new Date(),
                })
                .where(eq(communityChannels.id, input.channelId))
                .returning();

            return updated;
        }),

    /** Delete a channel */
    deleteChannel: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                serverId: z.string().uuid(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");

            // Prevent deleting "general"
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);

            if (channel.length && channel[0].name === "general") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete the general channel" });
            }

            await db.delete(communityChannels).where(eq(communityChannels.id, input.channelId));
            return { success: true };
        }),

    // ─── Messages ────────────────────────────────────────

    /** Get paginated messages for a channel */
    /** Reorder channels (admin/mod) — channelIds in desired order */
    reorderChannels: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), channelIds: z.array(z.string().uuid()).min(1) }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            await Promise.all(input.channelIds.map((id, i) =>
                db.update(communityChannels)
                    .set({ position: i, updatedAt: new Date() })
                    .where(and(eq(communityChannels.id, id), eq(communityChannels.serverId, input.serverId)))
            ));
            return { success: true };
        }),

    /** Pin or unpin a message (admin/mod) */
    setMessagePinned: protectedProcedure
        .input(z.object({ serverId: z.string().uuid(), messageId: z.string().uuid(), pinned: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            const [msg] = await db
                .select({ id: communityMessages.id, channelId: communityMessages.channelId, serverId: communityChannels.serverId })
                .from(communityMessages)
                .innerJoin(communityChannels, eq(communityMessages.channelId, communityChannels.id))
                .where(eq(communityMessages.id, input.messageId))
                .limit(1);
            if (!msg || msg.serverId !== input.serverId) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
            }
            await db.update(communityMessages)
                .set({ pinned: input.pinned, updatedAt: new Date() })
                .where(eq(communityMessages.id, input.messageId));
            await notifyChannelChange(msg.channelId);
            return { success: true };
        }),

    /** Pinned messages for a channel */
    getPinnedMessages: protectedProcedure
        .input(z.object({ channelId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);
            if (!channel.length) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            const member = await db
                .select()
                .from(communityMembers)
                .where(and(
                    eq(communityMembers.serverId, channel[0].serverId),
                    eq(communityMembers.userId, ctx.user.id),
                ))
                .limit(1);
            if (!member.length) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

            return db
                .select({
                    id: communityMessages.id,
                    content: communityMessages.content,
                    fileUrl: communityMessages.fileUrl,
                    createdAt: communityMessages.createdAt,
                    userName: user.name,
                    userImage: user.avatar_url,
                })
                .from(communityMessages)
                .innerJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .innerJoin(user, eq(communityMembers.userId, user.id))
                .where(and(
                    eq(communityMessages.channelId, input.channelId),
                    eq(communityMessages.pinned, true),
                    eq(communityMessages.deleted, false),
                ))
                .orderBy(desc(communityMessages.createdAt))
                .limit(50);
        }),

    /** Mark a channel read (upsert the member's read marker) */
    markChannelRead: protectedProcedure
        .input(z.object({ channelId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);
            if (!channel.length) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            const member = await db
                .select()
                .from(communityMembers)
                .where(and(
                    eq(communityMembers.serverId, channel[0].serverId),
                    eq(communityMembers.userId, ctx.user.id),
                ))
                .limit(1);
            if (!member.length) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });

            await db
                .insert(communityChannelReads)
                .values({ memberId: member[0].id, channelId: input.channelId, lastReadAt: new Date() })
                .onConflictDoUpdate({
                    target: [communityChannelReads.memberId, communityChannelReads.channelId],
                    set: { lastReadAt: new Date() },
                });
            return { success: true };
        }),

    getMessages: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                cursor: z.string().optional(),
                limit: z.number().min(1).max(100).default(50),
            })
        )
        .query(async ({ ctx, input }) => {
            // Get the channel to verify membership
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);

            if (!channel.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            }

            // Verify membership
            const member = await db
                .select()
                .from(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, channel[0].serverId),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!member.length) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
            }

            const conditions = [eq(communityMessages.channelId, input.channelId)];
            if (input.cursor) {
                conditions.push(lt(communityMessages.createdAt, new Date(input.cursor)));
            }

            const replyMsg = alias(communityMessages, "reply_msg");
            const replyMember = alias(communityMembers, "reply_member");
            const replyUser = alias(user, "reply_user");

            const msgs = await db
                .select({
                    id: communityMessages.id,
                    content: communityMessages.content,
                    fileUrl: communityMessages.fileUrl,
                    deleted: communityMessages.deleted,
                    pinned: communityMessages.pinned,
                    replyToId: communityMessages.replyToId,
                    createdAt: communityMessages.createdAt,
                    updatedAt: communityMessages.updatedAt,
                    memberId: communityMessages.memberId,
                    channelId: communityMessages.channelId,
                    memberRole: communityMembers.role,
                    userId: communityMembers.userId,
                    userName: user.name,
                    userImage: user.avatar_url,
                    userUsername: user.username,
                    replyContent: replyMsg.content,
                    replyDeleted: replyMsg.deleted,
                    replyUserName: replyUser.name,
                })
                .from(communityMessages)
                .innerJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .innerJoin(user, eq(communityMembers.userId, user.id))
                .leftJoin(replyMsg, eq(communityMessages.replyToId, replyMsg.id))
                .leftJoin(replyMember, eq(replyMsg.memberId, replyMember.id))
                .leftJoin(replyUser, eq(replyMember.userId, replyUser.id))
                .where(and(...conditions))
                .orderBy(desc(communityMessages.createdAt))
                .limit(input.limit + 1);

            let nextCursor: string | undefined;
            if (msgs.length > input.limit) {
                const nextItem = msgs.pop()!;
                nextCursor = nextItem.createdAt.toISOString();
            }

            return { items: msgs, nextCursor };
        }),

    /** Send a message */
    sendMessage: protectedProcedure
        .input(
            z.object({
                channelId: z.string().uuid(),
                content: z.string().min(1),
                fileUrl: z.string().optional(),
                replyToId: z.string().uuid().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const channel = await db
                .select()
                .from(communityChannels)
                .where(eq(communityChannels.id, input.channelId))
                .limit(1);

            if (!channel.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
            }

            const member = await db
                .select()
                .from(communityMembers)
                .where(
                    and(
                        eq(communityMembers.serverId, channel[0].serverId),
                        eq(communityMembers.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!member.length) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Not a member" });
            }

            const [message] = await db
                .insert(communityMessages)
                .values({
                    content: input.content,
                    fileUrl: input.fileUrl ?? null,
                    memberId: member[0].id,
                    channelId: input.channelId,
                    replyToId: input.replyToId ?? null,
                })
                .returning();

            await notifyChannelChange(input.channelId);
            return message;
        }),

    /** Update a message (owner only) */
    updateMessage: protectedProcedure
        .input(
            z.object({
                messageId: z.string().uuid(),
                content: z.string().min(1),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const msg = await db
                .select({
                    id: communityMessages.id,
                    userId: communityMembers.userId,
                })
                .from(communityMessages)
                .innerJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .where(eq(communityMessages.id, input.messageId))
                .limit(1);

            if (!msg.length || msg[0].userId !== ctx.user.id) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit this message" });
            }

            const [updated] = await db
                .update(communityMessages)
                .set({ content: input.content, updatedAt: new Date() })
                .where(eq(communityMessages.id, input.messageId))
                .returning();

            if (updated) await notifyChannelChange(updated.channelId);
            return updated;
        }),

    /** Delete a message (soft delete — owner, admin, or mod) */
    deleteMessage: protectedProcedure
        .input(
            z.object({
                messageId: z.string().uuid(),
                serverId: z.string().uuid(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Check if current user is admin/mod OR the message owner
            const msg = await db
                .select({
                    id: communityMessages.id,
                    userId: communityMembers.userId,
                })
                .from(communityMessages)
                .innerJoin(communityMembers, eq(communityMessages.memberId, communityMembers.id))
                .where(eq(communityMessages.id, input.messageId))
                .limit(1);

            if (!msg.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
            }

            const isOwner = msg[0].userId === ctx.user.id;
            if (!isOwner) {
                await requireRole(input.serverId, ctx.user.id, "ADMIN", "MODERATOR");
            }

            const [updated] = await db
                .update(communityMessages)
                .set({ deleted: true, content: "This message has been deleted.", fileUrl: null, updatedAt: new Date() })
                .where(eq(communityMessages.id, input.messageId))
                .returning();

            if (updated) await notifyChannelChange(updated.channelId);
            return updated;
        }),
});

// ─── Helpers ─────────────────────────────────────────────

async function requireRole(serverId: string, userId: string, ...roles: string[]) {
    const member = await db
        .select()
        .from(communityMembers)
        .where(
            and(
                eq(communityMembers.serverId, serverId),
                eq(communityMembers.userId, userId)
            )
        )
        .limit(1);

    if (!member.length) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this server" });
    }

    if (!roles.includes(member[0].role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: `Requires ${roles.join(" or ")} role` });
    }

    return member[0];
}
