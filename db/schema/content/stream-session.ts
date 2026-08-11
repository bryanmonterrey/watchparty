import { index, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
}, (table) => [
    index("idx_stream_sessions_user").on(table.userId, table.startedAt),
    pgPolicy("stream_sessions_own_read", {
        for: "select",
        to: "authenticated",
        using: sql`user_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
