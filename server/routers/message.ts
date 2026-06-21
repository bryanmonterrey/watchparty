
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { messages, conversationParticipants, conversations, messageReactions, messageReadReceipts } from "@/db/schema/messaging";
import { eq, and, desc, inArray, getTableColumns, aliasedTable } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publishToRoom } from "@/lib/realtime/publish";
import { rooms } from "@/lib/realtime/protocol";

export const messageRouter = router({
    /**
     * List messages for a conversation
     */
    list: protectedProcedure
        .input(
            z.object({
                conversationId: z.string().uuid(),
                limit: z.number().min(1).max(100).default(50),
                cursor: z.string().uuid().optional(),
            })
        )
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

            // Fetch messages with replyTo content
            const replyMessage = aliasedTable(messages, "replyMessage");

            const conversationMessages = (await db
                .select({
                    ...getTableColumns(messages),
                    reply_id: replyMessage.id,
                    reply_content: replyMessage.content,
                    reply_senderId: replyMessage.senderId,
                    reply_messageType: replyMessage.messageType,
                    reply_attachmentUrl: replyMessage.attachmentUrl,
                    reply_encryptionIv: replyMessage.encryptionIv,
                    reply_isEncrypted: replyMessage.isEncrypted,
                })
                .from(messages)
                .leftJoin(replyMessage, eq(messages.replyToId, replyMessage.id))
                .where(eq(messages.conversationId, input.conversationId))
                .orderBy(desc(messages.createdAt))
                .limit(input.limit + 1)) as any[];

            let nextCursor: string | undefined = undefined;
            if (conversationMessages.length > input.limit) {
                const nextItem = conversationMessages.pop();
                nextCursor = nextItem.id;
            }

            // Fetch reactions for these messages
            const messageIds = conversationMessages.map((m: any) => m.id);
            let reactionsRecord: Record<string, typeof messageReactions.$inferSelect[]> = {};
            let readReceiptsRecord: Record<string, typeof messageReadReceipts.$inferSelect[]> = {};

            if (messageIds.length > 0) {
                const reactions = await db
                    .select()
                    .from(messageReactions)
                    .where(inArray(messageReactions.messageId, messageIds));

                reactions.forEach(r => {
                    if (!reactionsRecord[r.messageId]) {
                        reactionsRecord[r.messageId] = [];
                    }
                    reactionsRecord[r.messageId].push(r);
                });

                // Fetch read receipts
                const receipts = await db
                    .select()
                    .from(messageReadReceipts)
                    .where(inArray(messageReadReceipts.messageId, messageIds));

                receipts.forEach(r => {
                    if (!readReceiptsRecord[r.messageId]) {
                        readReceiptsRecord[r.messageId] = [];
                    }
                    readReceiptsRecord[r.messageId].push(r);
                });
            }

            return {
                success: true,
                messages: conversationMessages.reverse().map((msg: any) => {
                    const {
                        reply_id, reply_content, reply_senderId, reply_messageType,
                        reply_attachmentUrl, reply_encryptionIv, reply_isEncrypted,
                        ...message
                    } = msg;

                    return {
                        ...message,
                        reactions: reactionsRecord[message.id] || [],
                        readReceipts: readReceiptsRecord[message.id] || [],
                        replyToMessage: reply_id ? {
                            id: reply_id,
                            content: reply_content,
                            senderId: reply_senderId,
                            messageType: reply_messageType,
                            attachmentUrl: reply_attachmentUrl,
                            encryptionIv: reply_encryptionIv,
                            isEncrypted: reply_isEncrypted,
                        } : null
                    };
                }),
                nextCursor,
            };
        }),

    /**
     * Send a new message (encrypted)
     */
    send: protectedProcedure
        .input(
            z.object({
                conversationId: z.string().uuid(),
                content: z.string(), // Encrypted ciphertext (base64)
                encryptionIv: z.string(), // IV (base64)
                messageType: z.enum(["text", "image", "file", "audio", "system", "transaction_send", "transaction_request"]).default("text"),
                attachmentUrl: z.string().optional(),
                replyToId: z.string().uuid().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
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

            // Insert message
            const [newMessage] = await db
                .insert(messages)
                .values({
                    conversationId: input.conversationId,
                    senderId: ctx.user.id,
                    content: input.content,
                    encryptionIv: input.encryptionIv,
                    isEncrypted: true,
                    messageType: input.messageType,
                    attachmentUrl: input.attachmentUrl,
                    replyToId: input.replyToId,
                })
                .returning();

            // Update conversation lastMessageAt
            await db
                .update(conversations)
                .set({
                    lastMessageAt: newMessage.createdAt,
                    lastMessageId: newMessage.id
                })
                .where(eq(conversations.id, input.conversationId));

            // Fan out to connected clients (ciphertext relay — decrypted client-side).
            await publishToRoom(rooms.dm(input.conversationId), {
                t: "message",
                payload: newMessage,
            });

            return {
                success: true,
                message: newMessage,
            };
        }),

    /**
     * Edit a message
     */
    edit: protectedProcedure
        .input(
            z.object({
                messageId: z.string().uuid(),
                content: z.string(), // New encrypted content
                encryptionIv: z.string(), // New IV
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Verify user owns the message
            const message = await db
                .select()
                .from(messages)
                .where(
                    and(
                        eq(messages.id, input.messageId),
                        eq(messages.senderId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!message.length) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You can only edit your own messages",
                });
            }

            // Update message
            const [updatedMessage] = await db
                .update(messages)
                .set({
                    content: input.content,
                    encryptionIv: input.encryptionIv,
                    editedAt: new Date(),
                })
                .where(eq(messages.id, input.messageId))
                .returning();

            return {
                success: true,
                message: updatedMessage,
            };
        }),

    /**
     * Delete a message (soft delete)
     */
    delete: protectedProcedure
        .input(z.object({ messageId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // Verify user owns the message
            const message = await db
                .select()
                .from(messages)
                .where(
                    and(
                        eq(messages.id, input.messageId),
                        eq(messages.senderId, ctx.user.id)
                    )
                )
                .limit(1);

            if (!message.length) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You can only delete your own messages",
                });
            }

            // Soft delete
            await db
                .update(messages)
                .set({ deletedAt: new Date() })
                .where(eq(messages.id, input.messageId));

            return {
                success: true,
            };
        }),

    /**
     * Mark messages as read
     */
    markAsRead: protectedProcedure
        .input(
            z.object({
                conversationId: z.string().uuid(),
                messageIds: z.array(z.string().uuid()),
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (input.messageIds.length === 0) return { success: true };

            const values = input.messageIds.map(msgId => ({
                messageId: msgId,
                userId: ctx.user.id,
            }));

            // Upsert read receipts (ignore if already exists)
            const inserted = await db
                .insert(messageReadReceipts)
                .values(values)
                .onConflictDoNothing()
                .returning();

            // Fan out only the newly-created receipts.
            for (const r of inserted) {
                await publishToRoom(rooms.dm(input.conversationId), {
                    t: "event",
                    name: "read-receipt",
                    payload: {
                        eventType: "INSERT",
                        new: {
                            id: r.id,
                            message_id: r.messageId,
                            user_id: r.userId,
                            read_at: r.readAt,
                        },
                    },
                });
            }

            return { success: true };
        }),

    /**
     * Toggle a reaction on a message
     */
    toggleReaction: protectedProcedure
        .input(
            z.object({
                messageId: z.string().uuid(),
                emoji: z.string().min(1),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Verify message exists
            const message = await db
                .select()
                .from(messages)
                .where(eq(messages.id, input.messageId))
                .limit(1);

            if (!message.length) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Message not found",
                });
            }

            // Check if reaction exists
            const existingReaction = await db
                .select()
                .from(messageReactions)
                .where(
                    and(
                        eq(messageReactions.messageId, input.messageId),
                        eq(messageReactions.userId, ctx.user.id),
                        eq(messageReactions.emoji, input.emoji)
                    )
                )
                .limit(1);

            const room = rooms.dm(message[0].conversationId);

            if (existingReaction.length > 0) {
                // Remove reaction
                await db
                    .delete(messageReactions)
                    .where(eq(messageReactions.id, existingReaction[0].id));

                await publishToRoom(room, {
                    t: "event",
                    name: "reaction",
                    payload: { eventType: "DELETE", old: { id: existingReaction[0].id } },
                });

                return { success: true, action: "removed" };
            } else {
                // Add reaction
                const [reaction] = await db
                    .insert(messageReactions)
                    .values({
                        messageId: input.messageId,
                        userId: ctx.user.id,
                        emoji: input.emoji,
                    })
                    .returning();

                // Update conversation last activity
                // We need the conversationId. The message has it.
                await db
                    .update(conversations)
                    .set({
                        lastReactionAt: new Date(),
                        lastReactionSenderId: ctx.user.id
                    })
                    .where(eq(conversations.id, message[0].conversationId));

                await publishToRoom(room, {
                    t: "event",
                    name: "reaction",
                    payload: {
                        eventType: "INSERT",
                        new: {
                            id: reaction.id,
                            message_id: reaction.messageId,
                            user_id: reaction.userId,
                            emoji: reaction.emoji,
                        },
                    },
                });

                return { success: true, action: "added" };
            }
        }),
});
