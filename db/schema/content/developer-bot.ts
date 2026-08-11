import { pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";
import { developerApps } from "./developer-app";

// A developer app's bot user (Discord's bot model — the bot IS a real user
// row, so chat/communities/permissions compose for free). One bot per app
// (unique appId). The token is `wpb_<keyId>.<sig>` on the SAME scheme as the
// app's API keys (lib/api-gate.ts): the sig is HMAC(API_GATE_SECRET, bot:keyId)
// so it verifies statelessly (forgeries rejected before any DB hit) and a DB
// leak can't forge a token without the server secret. Only the non-secret
// keyId is stored; the token is view-once, reset-only. Bot-token auth resolves
// this to a `ctx.bot` in server/trpc.ts — bots never get a user session, so
// every protectedProcedure rejects them (fail-closed).
export const developerBots = pgTable("developer_bots", {
    // The bot's user id (a real row in `user` with is_bot = true).
    botUserId: text("bot_user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull().unique().references(() => developerApps.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    // The token's public key id (the `<keyId>` in wpb_<keyId>.<sig>). NOT secret
    // on its own — forging a token also needs the HMAC secret. Rotating the
    // token issues a new keyId, so the old token stops resolving.
    keyId: text("key_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    pgPolicy("developer_bots_owner", {
        for: "all",
        to: "authenticated",
        using: sql`owner_id = (SELECT auth.uid()::text)`,
    }),
]).enableRLS();
