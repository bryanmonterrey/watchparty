import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "../auth/user";
import { communityServers } from "../community";

// Where a bot is installed and what it may do there. One row per (bot, community);
// `permissions` is the bitfield from lib/developer/bot-permissions.ts. A bot with
// no row for a community can do nothing in it — installs are the second gate after
// the `Bot <token>` auth (server/trpc.ts). Owner-managed from the console Bot tab;
// a bot reads its own installs via bot.installs to discover its scope.
//
// RLS enabled with NO policy (like community_webhooks): this is server-side-only,
// reached solely through tRPC on the service connection. Nothing here should ever
// be exposed to a PostgREST/anon client, so it gets no SELECT policy at all.
export const developerBotInstalls = pgTable("developer_bot_installs", {
    id: uuid("id").primaryKey().defaultRandom(),
    // The bot user (1:1 with an app via developer_bots).
    botUserId: text("bot_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    serverId: uuid("server_id").notNull().references(() => communityServers.id, { onDelete: "cascade" }),
    // Bitfield — see BOT_PERMISSIONS. Stored sanitised (unknown bits masked off).
    permissions: integer("permissions").notNull().default(0),
    // Who installed it (the app owner or a community admin). Kept for audit; the
    // install survives them leaving, so null-on-delete rather than cascade.
    installedBy: text("installed_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex("idx_developer_bot_installs_bot_server").on(table.botUserId, table.serverId),
    index("idx_developer_bot_installs_server").on(table.serverId),
]).enableRLS();
