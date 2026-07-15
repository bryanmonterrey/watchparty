import { pgTable, pgEnum, pgPolicy, uuid, text, timestamp, boolean, index, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { user } from '../auth/user';

// Enums
export const communityMemberRole = pgEnum('community_member_role', ['ADMIN', 'MODERATOR', 'GUEST']);
export const communityChannelType = pgEnum('community_channel_type', ['TEXT', 'AUDIO', 'VIDEO']);

// ─── Servers ─────────────────────────────────────────────
export const communityServers = pgTable('community_servers', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    imageUrl: text('image_url'),
    inviteCode: text('invite_code').notNull().unique(),
    ownerId: text('owner_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_community_servers_owner').on(table.ownerId),
    pgPolicy('community_servers_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.server_id = id AND community_members.user_id = (SELECT auth.uid()::text))` }),
    pgPolicy('community_servers_insert_auth', { for: 'insert', to: 'authenticated', withCheck: sql`owner_id = (SELECT auth.uid()::text)` }),
    pgPolicy('community_servers_update_owner', { for: 'update', to: 'authenticated', using: sql`owner_id = (SELECT auth.uid()::text)` }),
    pgPolicy('community_servers_delete_owner', { for: 'delete', to: 'authenticated', using: sql`owner_id = (SELECT auth.uid()::text)` }),
]).enableRLS();

// ─── Members ─────────────────────────────────────────────
export const communityMembers = pgTable('community_members', {
    id: uuid('id').primaryKey().defaultRandom(),
    role: communityMemberRole('role').default('GUEST').notNull(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    serverId: uuid('server_id')
        .references(() => communityServers.id, { onDelete: 'cascade' })
        .notNull(),
    // Rail sort order for this member's server list (null = joined order)
    railPosition: integer('rail_position'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_community_members_user').on(table.userId),
    index('idx_community_members_server').on(table.serverId),
    uniqueIndex('idx_community_members_user_server').on(table.userId, table.serverId),
    pgPolicy('community_members_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members cm WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text))` }),
    pgPolicy('community_members_insert_auth', { for: 'insert', to: 'authenticated', withCheck: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('community_members_delete_own', { for: 'delete', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();

// ─── Channels ────────────────────────────────────────────
export const communityChannels = pgTable('community_channels', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: communityChannelType('type').default('TEXT').notNull(),
    serverId: uuid('server_id')
        .references(() => communityServers.id, { onDelete: 'cascade' })
        .notNull(),
    createdById: text('created_by_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    // Sort order within the server (null = fall back to createdAt)
    position: integer('position'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_community_channels_server').on(table.serverId),
    pgPolicy('community_channels_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.server_id = server_id AND community_members.user_id = (SELECT auth.uid()::text))` }),
    pgPolicy('community_channels_insert_admin', { for: 'insert', to: 'authenticated', withCheck: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.server_id = server_id AND community_members.user_id = (SELECT auth.uid()::text) AND community_members.role IN ('ADMIN', 'MODERATOR'))` }),
    pgPolicy('community_channels_delete_admin', { for: 'delete', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.server_id = server_id AND community_members.user_id = (SELECT auth.uid()::text) AND community_members.role = 'ADMIN')` }),
]).enableRLS();

// ─── Messages ────────────────────────────────────────────
export const communityMessages = pgTable('community_messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    content: text('content').notNull(),
    fileUrl: text('file_url'),
    memberId: uuid('member_id')
        .references(() => communityMembers.id, { onDelete: 'cascade' })
        .notNull(),
    channelId: uuid('channel_id')
        .references(() => communityChannels.id, { onDelete: 'cascade' })
        .notNull(),
    // Reply threading (SET NULL keeps the child when the parent is removed)
    replyToId: uuid('reply_to_id'),
    pinned: boolean('pinned').default(false).notNull(),
    deleted: boolean('deleted').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_community_messages_member').on(table.memberId),
    index('idx_community_messages_channel').on(table.channelId),
    index('idx_community_messages_created').on(table.createdAt),
    pgPolicy('community_messages_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members cm JOIN community_channels cc ON cc.server_id = cm.server_id WHERE cc.id = channel_id AND cm.user_id = (SELECT auth.uid()::text))` }),
    pgPolicy('community_messages_insert_member', { for: 'insert', to: 'authenticated', withCheck: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text))` }),
    pgPolicy('community_messages_update_own', { for: 'update', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

// ─── Relations ───────────────────────────────────────────
export const communityServersRelations = relations(communityServers, ({ many, one }) => ({
    members: many(communityMembers),
    channels: many(communityChannels),
    owner: one(user, {
        fields: [communityServers.ownerId],
        references: [user.id],
    }),
}));

export const communityMembersRelations = relations(communityMembers, ({ one, many }) => ({
    user: one(user, {
        fields: [communityMembers.userId],
        references: [user.id],
    }),
    server: one(communityServers, {
        fields: [communityMembers.serverId],
        references: [communityServers.id],
    }),
    messages: many(communityMessages),
}));

export const communityChannelsRelations = relations(communityChannels, ({ one, many }) => ({
    server: one(communityServers, {
        fields: [communityChannels.serverId],
        references: [communityServers.id],
    }),
    createdBy: one(user, {
        fields: [communityChannels.createdById],
        references: [user.id],
    }),
    messages: many(communityMessages),
}));

export const communityMessagesRelations = relations(communityMessages, ({ one }) => ({
    member: one(communityMembers, {
        fields: [communityMessages.memberId],
        references: [communityMembers.id],
    }),
    channel: one(communityChannels, {
        fields: [communityMessages.channelId],
        references: [communityChannels.id],
    }),
}));

// Type exports
export type CommunityServer = typeof communityServers.$inferSelect;
export type CommunityMember = typeof communityMembers.$inferSelect;
export type CommunityChannel = typeof communityChannels.$inferSelect;
export type CommunityMessage = typeof communityMessages.$inferSelect;

// Live audio rooms (Spaces)
export * from "./spaces";

// ─── Channel read state (unread indicators) ─────────────
export const communityChannelReads = pgTable('community_channel_reads', {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
        .references(() => communityMembers.id, { onDelete: 'cascade' })
        .notNull(),
    channelId: uuid('channel_id')
        .references(() => communityChannels.id, { onDelete: 'cascade' })
        .notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex('uq_channel_reads_member_channel').on(table.memberId, table.channelId),
    index('idx_channel_reads_channel').on(table.channelId),
    pgPolicy('community_channel_reads_own', { for: 'all', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityChannelRead = typeof communityChannelReads.$inferSelect;

// ─── Message reactions ───────────────────────────────────
export const communityMessageReactions = pgTable('community_message_reactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
        .references(() => communityMessages.id, { onDelete: 'cascade' })
        .notNull(),
    memberId: uuid('member_id')
        .references(() => communityMembers.id, { onDelete: 'cascade' })
        .notNull(),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex('uq_reaction_message_member_emoji').on(table.messageId, table.memberId, table.emoji),
    index('idx_message_reactions_message').on(table.messageId),
    pgPolicy('community_message_reactions_own', { for: 'all', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityMessageReaction = typeof communityMessageReactions.$inferSelect;
