import { pgTable, pgPolicy, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from '../auth/user';

// Persistence for "ask chat". Until this existed the assistant was entirely
// in-memory — closing the panel discarded the conversation — so the history
// button had nothing to open.
//
// Deliberately NOT reusing the `conversations`/`messages` tables in
// db/schema/messaging: those model a chat BETWEEN USERS (participants, read
// receipts, reactions, group metadata) and every one of those columns is
// meaningless for a thread with a model. Sharing them would mean either
// nullable columns nobody reads or a participant row per user pointing at
// themselves.

export const assistantThreads = pgTable('assistant_threads', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    // Derived from the first user message, not model-generated: a title costs
    // an extra inference round trip and this is shown in a list where the
    // opening question is a better label than a summary anyway.
    title: text('title').notNull(),
    // Which chat product owns the thread: 'ask' (the app's assistant panel) or
    // 'console' (the developer-console Agent). One persistence stack, two
    // surfaces — the column is what keeps console setups out of the app's ask
    // history dialog and vice versa.
    surface: text('surface').default('ask').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Ordering key for the history list — bumped on every append, so a thread
    // returned to yesterday sorts above one abandoned this morning.
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    // The history dialog's only query: this user's threads, newest first.
    index('idx_assistant_threads_user_updated').on(table.userId, table.updatedAt),
    pgPolicy('assistant_threads_own', {
        for: 'all',
        to: 'authenticated',
        using: sql`user_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();

export const assistantMessages = pgTable('assistant_messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
        .references(() => assistantThreads.id, { onDelete: 'cascade' })
        .notNull(),
    role: text('role').notNull(),
    // The AI SDK v7 UIMessage `parts` array, stored whole rather than flattened
    // to text. Parts carry tool calls and reasoning alongside prose, and a
    // reloaded thread has to render what the live one rendered — flattening
    // would silently drop every tool result on reload.
    parts: jsonb('parts').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index('idx_assistant_messages_thread').on(table.threadId, table.createdAt),
    pgPolicy('assistant_messages_own', {
        for: 'all',
        to: 'authenticated',
        using: sql`EXISTS (SELECT 1 FROM assistant_threads t WHERE t.id = assistant_messages.thread_id AND t.user_id = (SELECT auth.uid()::text))`,
    }),
]).enableRLS();
