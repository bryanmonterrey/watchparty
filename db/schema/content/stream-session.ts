import { bigint, index, integer, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

// A single past/live broadcast — the studio's Producer/Broadcasts list
// (studio.x.com Producer). The streams table holds ONE row per user (current
// config); this records each go-live→offline as its own row so a creator sees
// their broadcast history with durations. Written by the IVS webhook (Stream
// Start opens, Stream End closes) and the setLiveStatus toggle.
export const streamSessions = pgTable("stream_sessions", {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    title: text("title"),
    category: text("category"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // ── Concurrent-viewer aggregates (db/stream-session-ccv.sql) ─────────
    // Folded in by the ivs-viewers cron, which already runs EVERY MINUTE and
    // already holds every live channel's viewerCount — so per-stream CCV cost
    // no new cron, no new endpoint and no samples table. Three running numbers
    // instead of a row per minute: a table would grow by (live streams ×
    // minutes) forever to answer two questions.
    //
    // avg = viewerSum / sampleCount. Honest about what it is: the mean of
    // once-a-minute samples, not a time-weighted average — evenly spaced
    // samples make that difference small, and a spike lasting under a minute
    // can still be missed entirely, which is why PEAK is stored rather than
    // derived.
    peakViewers: integer("peak_viewers").default(0).notNull(),
    sampleCount: integer("sample_count").default(0).notNull(),
    viewerSum: bigint("viewer_sum", { mode: "number" }).default(0).notNull(),
}, (table) => [
    index("idx_stream_sessions_user").on(table.userId, table.startedAt),
    pgPolicy("stream_sessions_own_read", {
        for: "select",
        to: "authenticated",
        using: sql`user_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
