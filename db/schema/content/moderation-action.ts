import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

/**
 * The channel moderation audit log — who did what, to whom, in whose channel.
 *
 * Every moderation verb we already had (ban, unban, mod/VIP roles, chat mode,
 * pins) MUTATED state and left no trace: a creator could see that someone is
 * banned, never that a moderator banned them an hour ago, or why. That is the
 * one question an audit surface exists to answer, and it is unanswerable
 * retroactively — nothing to backfill from.
 *
 * `creatorId` is the CHANNEL, not the actor. A moderator acting in someone
 * else's channel writes a row owned by that channel, which is what makes
 * "show me my channel's mod log" a single indexed read, and is why this is not
 * keyed on the actor.
 *
 * Both user references are ON DELETE SET NULL rather than CASCADE: a deleted
 * account must not silently erase the record of what was done to it, or by it.
 * The log keeps the row and loses the name.
 *
 * See db/studio-mod-actions.sql — additive, nullable, no backfill.
 */
export const moderationActions = pgTable("moderation_actions", {
    id: text("id").primaryKey(),
    /** Whose channel the action happened in. */
    creatorId: text("creator_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    /** Who performed it — the creator, or one of their moderators. */
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    /** Who it was done to. Null for channel-wide actions (chat mode). */
    targetUserId: text("target_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action", {
        enum: [
            "ban",
            "unban",
            "mod_add",
            "mod_remove",
            "vip_add",
            "vip_remove",
            "chat_mode",
            "pin_message",
        ],
    }).notNull(),
    /** Free-text context: a ban reason, the chat mode chosen, the pinned text. */
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_mod_actions_channel").on(table.creatorId, table.createdAt),
    pgPolicy("mod_actions_channel_read", {
        for: "select",
        to: "authenticated",
        using: sql`creator_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
