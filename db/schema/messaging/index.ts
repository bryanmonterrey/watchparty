import { pgTable, pgPolicy, uuid, text, timestamp, boolean, foreignKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from '../auth/user';

export const conversations = pgTable('conversations', {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    isGroup: boolean('is_group').default(false).notNull(),
    groupName: text('group_name'),
    groupAvatar: text('group_avatar'),
    lastReactionAt: timestamp('last_reaction_at', { withTimezone: true }),
    lastReactionSenderId: text('last_reaction_sender_id'),
    lastMessageId: uuid('last_message_id'),
}, (table) => [
    pgPolicy("conversations_select_participant", { for: "select", to: "authenticated", using: sql`EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export const conversationParticipants = pgTable('conversation_participants', {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
        .references(() => conversations.id, { onDelete: 'cascade' })
        .notNull(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    isMuted: boolean('is_muted').default(false).notNull(),
}, (table) => [
    index("idx_cp_user_id").on(table.userId),
    index("idx_cp_conversation_id").on(table.conversationId),
    index("idx_cp_conv_user").on(table.conversationId, table.userId),
    pgPolicy("participants_select_own_conversations", { for: "select", to: "authenticated", using: sql`EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversation_participants.conversation_id AND cp.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export const messages = pgTable('messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
        .references(() => conversations.id, { onDelete: 'cascade' })
        .notNull(),
    senderId: text('sender_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    content: text('content').notNull(), // Encrypted ciphertext (base64)
    encryptionIv: text('encryption_iv').notNull(), // Initialization vector (base64)
    isEncrypted: boolean('is_encrypted').default(true).notNull(),
    messageType: text('message_type').default('text').notNull(), // 'text', 'image', 'file', 'system'
    attachmentUrl: text('attachment_url'),
    replyToId: uuid('reply_to_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
    foreignKey({
        columns: [table.replyToId],
        foreignColumns: [table.id],
        name: 'messages_reply_to_id_fk'
    }).onDelete('set null'),
    index("idx_messages_conversation_id").on(table.conversationId),
    index("idx_messages_sender_id").on(table.senderId),
    index("idx_messages_created_at").on(table.createdAt),
    pgPolicy("messages_select_participant", { for: "select", to: "authenticated", using: sql`EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export const messageReactions = pgTable('message_reactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
        .references(() => messages.id, { onDelete: 'cascade' })
        .notNull(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_reactions_message_id").on(table.messageId),
    pgPolicy("reactions_select_participant", { for: "select", to: "authenticated", using: sql`EXISTS (SELECT 1 FROM messages m JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id WHERE m.id = message_reactions.message_id AND cp.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export const messageReadReceipts = pgTable('message_read_receipts', {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
        .references(() => messages.id, { onDelete: 'cascade' })
        .notNull(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_read_receipts_message_id").on(table.messageId),
    pgPolicy("read_receipts_select_participant", { for: "select", to: "authenticated", using: sql`EXISTS (SELECT 1 FROM messages m JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id WHERE m.id = message_read_receipts.message_id AND cp.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export const userEncryptionKeys = pgTable('user_encryption_keys', {
    userId: text('user_id')
        .primaryKey()
        .references(() => user.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(), // ECDH P-256 public key (base64)
    privateKey: text('private_key'), // Encrypted private key (base64) - Nullable for backward compat
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    keyVersion: text('key_version').default('1').notNull(),
}, (table) => [
    pgPolicy("encryption_keys_select_authenticated", { for: "select", to: "authenticated", using: sql`true` }),
    pgPolicy("encryption_keys_manage_own", { for: "all", to: "authenticated", using: sql`user_id = (SELECT auth.uid()::text)`, withCheck: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();
