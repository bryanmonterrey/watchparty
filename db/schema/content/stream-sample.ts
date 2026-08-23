import { index, integer, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { streamSessions } from "./stream-session";

/**
 * One concurrent-viewer reading, once a minute, for one broadcast.
 *
 * This exists alongside the aggregates on `stream_sessions` rather than
 * instead of them, because they answer different questions and only one is
 * cheap: "what was the peak" is a number the aggregates already hold forever,
 * while "what did the audience DO over the hour" is a shape, and a shape needs
 * points.
 *
 * BOUNDED, which is what makes it affordable. The ivs-viewers cron writes one
 * row per live broadcast per minute — a four-hour stream is 240 rows — and
 * prunes anything past RETENTION_DAYS on the same pass. The aggregates outlive
 * the samples, so an old broadcast keeps its peak and average and loses only
 * its chart.
 *
 * See db/stream-samples.sql.
 */
export const streamSamples = pgTable("stream_samples", {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => streamSessions.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    viewers: integer("viewers").default(0).notNull(),
}, (table) => [
    // The only read: one session's samples in time order. Also the index the
    // prune walks.
    index("idx_stream_samples_session").on(table.sessionId, table.at),
    // No own-row policy: samples carry no user column. Reads go through
    // stream.broadcastDetail, which checks ownership of the SESSION first —
    // and RLS is enabled so nothing reaches them from the browser directly.
    pgPolicy("stream_samples_no_client_read", {
        for: "select",
        to: "authenticated",
        using: sql`false`,
    }),
]).enableRLS();
