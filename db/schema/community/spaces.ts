import { pgTable, pgEnum, pgPolicy, uuid, text, timestamp, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { user } from '../auth/user';
import { communityServers } from './index';

// ─── Enums ───────────────────────────────────────────────
export const communitySpaceStatus = pgEnum('community_space_status', ['LIVE', 'ENDED']);
export const communitySpaceRole = pgEnum('community_space_role', ['HOST', 'SPEAKER', 'LISTENER']);

// ─── Spaces (live audio rooms) ───────────────────────────
export const communitySpaces = pgTable('community_spaces', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    status: communitySpaceStatus('status').default('LIVE').notNull(),
    hostId: text('host_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    // Optional: a space can belong to a server, or be standalone.
    serverId: uuid('server_id').references(() => communityServers.id, { onDelete: 'cascade' }),
    /**
     * `public` = listed by `listLive` and its post reaches the feed.
     * `unlisted` = absent from both; reachable only by direct link.
     *
     * NOT a `private` value: invite-only access needs a per-user grant enforced
     * in `join`, and naming it without enforcing it is exactly the bug this
     * column fixes — the create dialog's "Hidden" option used to write only the
     * POST's visibility, leaving the room itself listed and joinable by anyone.
     * See db/space-visibility.sql.
     */
    visibility: text('visibility').notNull().default('public'),
    // Cloudflare RealtimeKit meeting id for this space's WebRTC audio (lazily
    // created on first join). Nullable — null until media is provisioned/used.
    mediaMeetingId: text('media_meeting_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_community_spaces_status').on(table.status),
    index('idx_community_spaces_host').on(table.hostId),
    index('idx_community_spaces_server').on(table.serverId),
    // Anyone signed in can discover live spaces.
    pgPolicy('community_spaces_select_auth', { for: 'select', to: 'authenticated', using: sql`true` }),
    pgPolicy('community_spaces_insert_host', { for: 'insert', to: 'authenticated', withCheck: sql`host_id = (SELECT auth.uid()::text)` }),
    pgPolicy('community_spaces_update_host', { for: 'update', to: 'authenticated', using: sql`host_id = (SELECT auth.uid()::text)` }),
    pgPolicy('community_spaces_delete_host', { for: 'delete', to: 'authenticated', using: sql`host_id = (SELECT auth.uid()::text)` }),
]).enableRLS();

// ─── Participants ────────────────────────────────────────
export const communitySpaceParticipants = pgTable('community_space_participants', {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
        .references(() => communitySpaces.id, { onDelete: 'cascade' })
        .notNull(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    role: communitySpaceRole('role').default('LISTENER').notNull(),
    // Listener raised their hand to speak; host sees it and can invite them up.
    // Cleared on any role change.
    handRaised: boolean('hand_raised').default(false).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_space_participants_space').on(table.spaceId),
    uniqueIndex('idx_space_participants_unique').on(table.spaceId, table.userId),
    pgPolicy('space_participants_select_auth', { for: 'select', to: 'authenticated', using: sql`true` }),
    pgPolicy('space_participants_insert_own', { for: 'insert', to: 'authenticated', withCheck: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('space_participants_update_own', { for: 'update', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
    pgPolicy('space_participants_delete_own', { for: 'delete', to: 'authenticated', using: sql`user_id = (SELECT auth.uid()::text)` }),
]).enableRLS();

// ─── Relations ───────────────────────────────────────────
export const communitySpacesRelations = relations(communitySpaces, ({ one, many }) => ({
    host: one(user, { fields: [communitySpaces.hostId], references: [user.id] }),
    participants: many(communitySpaceParticipants),
}));

export const communitySpaceParticipantsRelations = relations(communitySpaceParticipants, ({ one }) => ({
    space: one(communitySpaces, { fields: [communitySpaceParticipants.spaceId], references: [communitySpaces.id] }),
    user: one(user, { fields: [communitySpaceParticipants.userId], references: [user.id] }),
}));

export type CommunitySpace = typeof communitySpaces.$inferSelect;
export type CommunitySpaceParticipant = typeof communitySpaceParticipants.$inferSelect;
