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
    // Short server tag (profile card + name menu)
    tag: text('tag'),
    // Comma-separated blocked words; guests' messages containing one are rejected
    automodKeywords: text('automod_keywords'),
    // Access: while true, joins via invite link are rejected
    invitesPaused: boolean('invites_paused'),
    // Profile card: flat CSS banner color (no gradients)
    bannerColor: text('banner_color'),
    // "Why should people join" — shown on the invite page
    description: text('description'),
    // Comma-separated personality chips (max 5, app-enforced)
    traits: text('traits'),
    // When true, invite links show only name + icon
    privateProfile: boolean('private_profile'),
    // System messages: target channel (null = #general) + per-event toggles
    // (null/true = on, false = off)
    systemChannelId: uuid('system_channel_id'),
    welcomeMessages: boolean('welcome_messages'),
    boostMessages: boolean('boost_messages'),
    // AutoMod rules for members (mods/admins exempt)
    automodBlockLinks: boolean('automod_block_links'),
    automodBlockMentions: boolean('automod_block_mentions'),
    // Safety: posting requirements for guests (null = 'none')
    verificationLevel: text('verification_level'),
    // Destructive mod actions require the actor to have 2FA enabled
    requireMod2fa: boolean('require_mod_2fa'),
    // Image attachments render blurred until clicked
    blurMedia: boolean('blur_media'),
    // Listed on the communities landing; joinable without an invite
    discoverable: boolean('discoverable'),
    // Profile-card banner image (boost level 1+ perk; wins over bannerColor)
    bannerImageUrl: text('banner_image_url'),
    // Server rules (newline-separated) + must-agree-before-chatting gate
    rules: text('rules'),
    rulesRequired: boolean('rules_required'),
    // 18+ confirmation before viewing the server
    ageRestricted: boolean('age_restricted'),
    // Server tag chip: badge emoji + color token
    tagBadge: text('tag_badge'),
    tagColor: text('tag_color'),
    // Vanity invite code (boost level 3 perk) — resolves like inviteCode
    customInvite: text('custom_invite'),
    // Boost progress bar in the channel sidebar
    showBoostBar: boolean('show_boost_bar'),
    // Rail badge default: 'all' (any unread) | 'mentions' (mentions only)
    defaultNotifications: text('default_notifications'),
    // Join-surge notice posted to the system channel
    activityAlerts: boolean('activity_alerts'),
    // Built-in profanity filter for members (AutoMod)
    automodFlaggedWords: boolean('automod_flagged_words'),
    // Shareable code that pre-fills a new server's structure
    templateCode: text('template_code'),
    // Public /widget/[serverId] embed page
    widgetEnabled: boolean('widget_enabled'),
    // "Active now" (live members) in the channel sidebar
    activityFeed: boolean('activity_feed'),
    // Voice AFK: idle members move here after the timeout
    inactiveChannelId: uuid('inactive_channel_id'),
    inactiveTimeoutMinutes: integer('inactive_timeout_minutes'),
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
    // Per-server display name ("per-server profile")
    nickname: text('nickname'),
    // Per-member server mute (suppresses unread badges)
    muted: boolean('muted'),
    // When they agreed to the server rules (null = not yet)
    rulesAgreedAt: timestamp('rules_agreed_at', { withTimezone: true }),
    // How they joined: 'invite' | 'discovery'
    joinMethod: text('join_method'),
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
    // Read-only: guests can read but only mods/admins post (null = writable)
    readOnly: boolean('read_only'),
    // RealtimeKit meeting for AUDIO/VIDEO channels (lazy, like Spaces)
    mediaMeetingId: text('media_meeting_id'),
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
    // System rows (joins, boosts) render compact in chat
    system: boolean('system'),
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

// ─── Server boosts (one per member per server, free v1) ──
export const communityServerBoosts = pgTable('community_server_boosts', {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
        .references(() => communityServers.id, { onDelete: 'cascade' })
        .notNull(),
    memberId: uuid('member_id')
        .references(() => communityMembers.id, { onDelete: 'cascade' })
        .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex('uq_server_boosts_server_member').on(table.serverId, table.memberId),
    index('idx_server_boosts_server').on(table.serverId),
    pgPolicy('community_server_boosts_own', { for: 'all', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members WHERE community_members.id = member_id AND community_members.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityServerBoost = typeof communityServerBoosts.$inferSelect;

// ─── Boost grants (purchased packs; tier slots are computed live) ──
export const communityBoostGrants = pgTable('community_boost_grants', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    amount: integer('amount').notNull(),
    source: text('source').default('purchase').notNull(),
    // On-chain USDC payment signature; UNIQUE = a tx redeems exactly once
    txSignature: text('tx_signature').unique(),
    usdPaid: integer('usd_paid'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_boost_grants_user').on(table.userId),
    pgPolicy('community_boost_grants_select_own', { for: 'select', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();

export type CommunityBoostGrant = typeof communityBoostGrants.$inferSelect;

// ─── Bans (kicked users can rejoin; banned users cannot) ──
export const communityBans = pgTable('community_bans', {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
        .references(() => communityServers.id, { onDelete: 'cascade' })
        .notNull(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    reason: text('reason'),
    bannedBy: text('banned_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex('uq_bans_server_user').on(table.serverId, table.userId),
    index('idx_community_bans_server').on(table.serverId),
    pgPolicy('community_bans_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members cm WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityBan = typeof communityBans.$inferSelect;

// ─── Audit log (mod-visible trail of management actions) ──
export const communityAuditLog = pgTable('community_audit_log', {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
        .references(() => communityServers.id, { onDelete: 'cascade' })
        .notNull(),
    actorUserId: text('actor_user_id').notNull(),
    action: text('action').notNull(),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_community_audit_server_created').on(table.serverId, table.createdAt),
    pgPolicy('community_audit_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members cm WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityAuditEntry = typeof communityAuditLog.$inferSelect;

// ─── Expressions (custom emoji + stickers) ────────────────
export const communityExpressions = pgTable('community_expressions', {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
        .references(() => communityServers.id, { onDelete: 'cascade' })
        .notNull(),
    // 'emoji' renders inline via :name:; 'sticker' sends as an image message
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    imageUrl: text('image_url').notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex('uq_expressions_server_kind_name').on(table.serverId, table.kind, table.name),
    index('idx_community_expressions_server').on(table.serverId),
    pgPolicy('community_expressions_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members cm WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityExpression = typeof communityExpressions.$inferSelect;

// ─── Custom roles (cosmetic identity over the 3 functional tiers) ──
export const communityRoles = pgTable('community_roles', {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
        .references(() => communityServers.id, { onDelete: 'cascade' })
        .notNull(),
    name: text('name').notNull(),
    // Flat hex token; colors the member's name in chat + member lists
    color: text('color').notNull(),
    position: integer('position'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_community_roles_server').on(table.serverId),
    pgPolicy('community_roles_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members cm WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityRole = typeof communityRoles.$inferSelect;

export const communityMemberRoles = pgTable('community_member_roles', {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
        .references(() => communityMembers.id, { onDelete: 'cascade' })
        .notNull(),
    roleId: uuid('role_id')
        .references(() => communityRoles.id, { onDelete: 'cascade' })
        .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex('uq_member_roles').on(table.memberId, table.roleId),
    index('idx_member_roles_member').on(table.memberId),
    index('idx_member_roles_role').on(table.roleId),
    pgPolicy('community_member_roles_select', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members m JOIN community_members me ON me.server_id = m.server_id WHERE m.id = member_id AND me.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityMemberRole = typeof communityMemberRoles.$inferSelect;

// ─── Invite links (multiple per server, with uses/expiry) ──
export const communityInvites = pgTable('community_invites', {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
        .references(() => communityServers.id, { onDelete: 'cascade' })
        .notNull(),
    code: text('code').notNull().unique(),
    createdBy: text('created_by').notNull(),
    // null = unlimited
    maxUses: integer('max_uses'),
    uses: integer('uses').default(0).notNull(),
    // null = never expires
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_community_invites_server').on(table.serverId),
    pgPolicy('community_invites_select_member', { for: 'select', to: 'authenticated', using: sql`EXISTS (SELECT 1 FROM community_members cm WHERE cm.server_id = server_id AND cm.user_id = (SELECT auth.uid()::text))` }),
]).enableRLS();

export type CommunityInvite = typeof communityInvites.$inferSelect;
