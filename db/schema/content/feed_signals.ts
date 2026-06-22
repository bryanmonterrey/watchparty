import { index, pgPolicy, pgTable, real, smallint, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"

// ─── Feed Signals ───────────────────────────────────────────────────────────
// Append-only engagement event log feeding the Phoenix (x-algorithm) ranker.
// Mirrors X's `unified_user_actions` firehose: every meaningful interaction is
// one row, later assembled into per-user history sequences for retrieval +
// ranking (see lib/feed-ranker/, app/api/cron/feed-corpus).
//
// actionType uses Phoenix's own action indices so values map straight into the
// model's action vocabulary (the ranker outputs a logit per action):
//   1  = favorite (like)
//   4  = reply
//   5  = quote
//   6  = repost
//   11 = dwell            (value = visible seconds)
//   13 = video quality view (value = fraction watched, 0..1)
//   20 = negative feedback ("not interested" / report) — downranks, NOT a Phoenix
//        default index; reserved high to avoid colliding with X's vocabulary.
//   21 = trade/conversion — RESERVED, not logged in v1. Highest-intent crypto
//        action; left dormant until we can measure lift vs. manipulation risk.
//
// subjectType namespaces post ids vs stream ids (live streams are a separate
// table, not posts) so the two never collide in the embedding tables.

export const feedSignals = pgTable("feed_signals", {
    id: text("id").primaryKey(),
    // The user who took the action.
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    // Content acted on. Not a hard FK: may reference posts.id OR streams.id.
    subjectId: text("subjectId").notNull(),
    subjectType: text("subjectType", { enum: ["post", "stream"] }).default("post").notNull(),
    // Creator of the content (for the author embedding tower).
    authorId: text("authorId"),
    // Phoenix action index (see header).
    actionType: smallint("actionType").notNull(),
    // Magnitude: 1.0 for binary actions, seconds for dwell, fraction for video view.
    value: real("value").default(1).notNull(),
    // Product surface the action happened on: "home" | "shorts" | "profile" | "stream" | ...
    surface: text("surface").default("home").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
    // Assemble a user's most-recent-N history (the ranker's primary read path).
    index("idx_feed_signals_user_time").on(table.userId, table.createdAt),
    // Per-content aggregation (popularity, training labels).
    index("idx_feed_signals_subject").on(table.subjectId, table.subjectType),
    pgPolicy("feed_signals_insert_own", { for: "insert", to: "authenticated", withCheck: sql`"userId" = (SELECT auth.uid()::text)` }),
    pgPolicy("feed_signals_select_own", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()

export type FeedSignal = typeof feedSignals.$inferSelect
export type NewFeedSignal = typeof feedSignals.$inferInsert
