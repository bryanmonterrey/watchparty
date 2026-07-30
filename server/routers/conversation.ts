import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { conversations, conversationParticipants, messages } from "@/db/schema/messaging";
import { eq, and, desc, or, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { user, encrypted_wallets, userEncryptionKeys } from "@/db/schema";
import { aliasedTable } from "drizzle-orm";

export const conversationRouter = router({
    /**
     * List all conversations for the current user
     */
    list: protectedProcedure.query(async ({ ctx }) => {
        const partnerParticipant = aliasedTable(conversationParticipants, "partner_participant");
        const partnerUser = aliasedTable(user, "partner_user");
        const lastMessage = aliasedTable(messages, "last_message");
        const senderKeys = aliasedTable(userEncryptionKeys, "sender_keys");
        const partnerKeys = aliasedTable(userEncryptionKeys, "partner_keys");

        const userConversations = await db
            .select({
                id: conversations.id,
                createdAt: conversations.createdAt,
                updatedAt: conversations.updatedAt,
                lastMessageAt: conversations.lastMessageAt,
                isGroup: conversations.isGroup,
                groupName: conversations.groupName,
                groupAvatar: conversations.groupAvatar,
                otherParticipantId: partnerUser.id,
                otherParticipantName: partnerUser.name,
                otherParticipantAvatar: partnerUser.avatar_url,
                otherParticipantWalletAddress: encrypted_wallets.address,
                // Last message details
                lastMessageContent: lastMessage.content,
                lastMessageSenderId: lastMessage.senderId,
                lastMessageType: lastMessage.messageType,
                lastMessageIsEncrypted: lastMessage.isEncrypted,
                lastMessageIv: lastMessage.encryptionIv,
                lastMessageSenderPublicKey: senderKeys.publicKey,
                otherParticipantPublicKey: partnerKeys.publicKey,
                lastReactionAt: conversations.lastReactionAt,
                lastReactionSenderId: conversations.lastReactionSenderId,
            })
            .from(conversations)
            .innerJoin(
                conversationParticipants,
                eq(conversations.id, conversationParticipants.conversationId)
            )
            .leftJoin(
                partnerParticipant,
                and(
                    eq(conversations.id, partnerParticipant.conversationId),
                    ne(partnerParticipant.userId, ctx.user.id)
                )
            )
            .leftJoin(partnerUser, eq(partnerParticipant.userId, partnerUser.id))
            .leftJoin(encrypted_wallets, eq(partnerUser.id, encrypted_wallets.user_id))
            // Join with messages to get the one matching lastMessageAt
            // Note: usage of lastMessageAt relies on it being in sync with message creation
            .leftJoin(lastMessage, eq(lastMessage.id, conversations.lastMessageId))
            // Join to get sender's public key for decryption (if someone else sent it)
            .leftJoin(senderKeys, eq(lastMessage.senderId, senderKeys.userId))
            // Join to get partner's public key (if I sent it, I need their key to decrypt)
            .leftJoin(partnerKeys, eq(partnerUser.id, partnerKeys.userId))
            .where(eq(conversationParticipants.userId, ctx.user.id))
            .orderBy(desc(sql`COALESCE(GREATEST(${conversations.lastMessageAt}, ${conversations.lastReactionAt}), ${conversations.createdAt})`));

        return {
            success: true,
            conversations: userConversations,
        };
    }),

    /**
     * Get a single conversation by ID
     */
    get: protectedProcedure
        .input(z.object({ conversationId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Verify user is a participant
            const participant = await db
                .select()
                .from(conversationParticipants)
                .where(
                    and(
                        eq(conversationParticipants.conversationId, input.conversationId),
                        eq(conversationParticipants.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!participant.length) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You are not a participant in this conversation",
                });
            }

            const conversation = await db
                .select()
                .from(conversations)
                .where(eq(conversations.id, input.conversationId))
                .limit(1);

            if (!conversation.length) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Conversation not found",
                });
            }

            return {
                success: true,
                conversation: conversation[0],
            };
        }),

    /**
     * Create a new conversation
     */
    create: protectedProcedure
        .input(
            z.object({
                participantIds: z.array(z.string()),
                isGroup: z.boolean().default(false),
                groupName: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // For DMs, check dmRequireFollow restriction on recipient
            if (!input.isGroup && input.participantIds.length === 1) {
                const recipientId = input.participantIds[0];
                const [recipient] = await db
                    .select({ dmRequireFollow: user.dmRequireFollow })
                    .from(user)
                    .where(eq(user.id, recipientId))
                    .limit(1);

                if (recipient?.dmRequireFollow) {
                    const { follows } = await import("@/db/schema/content");
                    const [followRow] = await db
                        .select({ id: follows.id })
                        .from(follows)
                        .where(and(eq(follows.followerId, recipientId), eq(follows.followingId, ctx.user.id)))
                        .limit(1);
                    if (!followRow) {
                        throw new TRPCError({ code: "FORBIDDEN", message: "This user only accepts DMs from people they follow." });
                    }
                }

                // DM paywall: check if recipient charges for DMs
                const recipientFull = await db
                    .select({ dmPrice: user.dmPrice })
                    .from(user)
                    .where(eq(user.id, recipientId))
                    .limit(1);
                const dmPrice = recipientFull[0]?.dmPrice ?? null;
                if (dmPrice && dmPrice > 0) {
                    const { dmUnlocks, subscriptions } = await import("@/db/schema/content");
                    const [unlock] = await db.select({ id: dmUnlocks.id }).from(dmUnlocks)
                        .where(and(eq(dmUnlocks.payerId, ctx.user.id), eq(dmUnlocks.creatorId, recipientId)))
                        .limit(1);
                    const [sub] = await db.select({ id: subscriptions.id }).from(subscriptions)
                        .where(and(
                            eq(subscriptions.subscriberId, ctx.user.id),
                            eq(subscriptions.creatorId, recipientId),
                            eq(subscriptions.status, "active"),
                        ))
                        .limit(1);
                    if (!unlock && !sub) {
                        throw new TRPCError({ code: "FORBIDDEN", message: `This user charges ${dmPrice} lamports to receive DMs.` });
                    }
                }
            }

            // Reuse the DM these two already have instead of stacking another.
            // This used to insert unconditionally, so every press of Message on a
            // profile minted a fresh conversation — a pair could end up with any
            // number of parallel threads, all but one of them dead, and the
            // newest one empty even when there was history to open.
            //
            // Deliberately AFTER the follow/paywall gates above: an old thread
            // must not become a way around a restriction the recipient has turned
            // on since.
            if (!input.isGroup && input.participantIds.length === 1) {
                const recipientId = input.participantIds[0];
                const mine = aliasedTable(conversationParticipants, "mine");
                const theirs = aliasedTable(conversationParticipants, "theirs");

                const [existing] = await db
                    .select({ conversation: conversations })
                    .from(conversations)
                    .innerJoin(
                        mine,
                        and(eq(mine.conversationId, conversations.id), eq(mine.userId, ctx.user.id)),
                    )
                    .innerJoin(
                        theirs,
                        and(eq(theirs.conversationId, conversations.id), eq(theirs.userId, recipientId)),
                    )
                    .where(
                        and(
                            eq(conversations.isGroup, false),
                            // Exactly the two of them. Matching on "both are in it"
                            // alone would also match a group that happens to
                            // include the pair.
                            sql`(SELECT count(*) FROM ${conversationParticipants} cp WHERE cp.conversation_id = ${conversations.id}) = 2`,
                        ),
                    )
                    // The thread with real history wins. NULLS LAST is load-bearing:
                    // lastMessageAt is null on an empty thread and Postgres sorts
                    // nulls FIRST on DESC, which would hand back the empty one.
                    .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`, desc(conversations.createdAt))
                    .limit(1);

                if (existing) {
                    return { success: true, conversation: existing.conversation, existing: true };
                }
            }

            // Create conversation
            const [newConversation] = await db
                .insert(conversations)
                .values({
                    isGroup: input.isGroup,
                    groupName: input.groupName,
                })
                .returning();

            // Add participants (including creator)
            const participantIds = [...new Set([ctx.user.id, ...input.participantIds])];
            await db.insert(conversationParticipants).values(
                participantIds.map((userId) => ({
                    conversationId: newConversation.id,
                    userId,
                }))
            );

            return {
                success: true,
                conversation: newConversation,
                existing: false,
            };
        }),

    /**
     * Get participants for a conversation
     */
    getParticipants: protectedProcedure
        .input(z.object({ conversationId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Verify user is a participant
            const userParticipant = await db
                .select()
                .from(conversationParticipants)
                .where(
                    and(
                        eq(conversationParticipants.conversationId, input.conversationId),
                        eq(conversationParticipants.userId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!userParticipant.length) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You are not a participant in this conversation",
                });
            }

            // Get participants with user details
            const { user: userTable } = await import('@/db/schema');
            const { ne: notEqual } = await import('drizzle-orm');

            const participants = await db
                .select({
                    id: conversationParticipants.id,
                    userId: conversationParticipants.userId,
                    conversationId: conversationParticipants.conversationId,
                    joinedAt: conversationParticipants.joinedAt,
                    lastReadAt: conversationParticipants.lastReadAt,
                    isMuted: conversationParticipants.isMuted,
                    name: userTable.name,
                    username: userTable.username,
                    email: userTable.email,
                    avatar_url: userTable.avatar_url,
                })
                .from(conversationParticipants)
                .innerJoin(userTable, eq(conversationParticipants.userId, userTable.id))
                .where(
                    and(
                        eq(conversationParticipants.conversationId, input.conversationId),
                        notEqual(conversationParticipants.userId, ctx.user.id)
                    )
                );

            return {
                success: true,
                participants,
            };
        }),

    /**
     * Count conversations with messages newer than the user's lastReadAt
     */
    getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
        const lastMsg = aliasedTable(messages, "last_msg");
        const result = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(conversationParticipants)
            .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
            .leftJoin(lastMsg, eq(lastMsg.id, conversations.lastMessageId))
            .where(
                and(
                    eq(conversationParticipants.userId, ctx.user.id),
                    sql`${conversations.lastMessageAt} IS NOT NULL`,
                    // Only count if the last message was sent by someone else
                    ne(lastMsg.senderId, ctx.user.id),
                    or(
                        sql`${conversationParticipants.lastReadAt} IS NULL`,
                        sql`${conversations.lastMessageAt} > ${conversationParticipants.lastReadAt}`
                    )
                )
            );
        return { count: result[0]?.count ?? 0 };
    }),

    /**
     * Update last read timestamp
     */
    markAsRead: protectedProcedure
        .input(z.object({ conversationId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await db
                .update(conversationParticipants)
                .set({ lastReadAt: new Date() })
                .where(
                    and(
                        eq(conversationParticipants.conversationId, input.conversationId),
                        eq(conversationParticipants.userId, ctx.user.id)
                    )
                );

            return {
                success: true,
            };
        }),
});
