import { pgTable, bigserial, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "../auth/user";

// The filtered-stream delivery queue (Phase 9). When an own-account event fires
// at a chokepoint, lib/developer/webhooks.ts runs it through each app's stream
// rules (lib/developer/stream-rules.ts) and writes ONE row here per matched
// rule. Developers consume via GET /api/stream/events?since=<seq> — a cursor
// pull with at-least-once, replayable-within-retention semantics, no long-lived
// connection (the production-correct transport on Workers/OpenNext until the
// shared realtime layer lands; a WebSocket push can later ride the same queue).
//
// `seq` is a bigserial — a global monotonic cursor. A consumer passes the last
// seq it saw and gets everything after it. Rows are pruned past a short
// retention window (they're an ephemeral live stream, not a durable log — the
// signed webhook is the durable channel). Server-side-only (RLS, no policy).
export const developerStreamDeliveries = pgTable("developer_stream_deliveries", {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    eventType: text("event_type").notNull(),
    // The tag of the rule that matched (or the rule text when it has no tag).
    tag: text("tag"),
    // The event data (without the type — that's `eventType`).
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
    index("idx_dev_stream_deliveries_app_seq").on(t.appId, t.seq),
    index("idx_dev_stream_deliveries_user_seq").on(t.userId, t.seq),
    index("idx_dev_stream_deliveries_created").on(t.createdAt),
]).enableRLS();
