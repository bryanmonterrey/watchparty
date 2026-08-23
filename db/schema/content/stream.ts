import { pgTable, pgPolicy, text, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "../auth/user";

export const streams = pgTable("streams", {
    id: text("id").primaryKey(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }).unique(),
    // IVS channel details
    channelArn: text("channelArn"),
    ingressId: text("ingressId"),
    streamKey: text("streamKey"),
    serverUrl: text("serverUrl"),
    playbackUrl: text("playbackUrl"),
    // IVS Chat
    chatRoomArn: text("chatRoomArn"),
    // Stream state
    isLive: boolean("isLive").default(false).notNull(),
    title: text("title"),
    category: text("category"),
    // The stream's coin. `ticker` is the intent, set in stream setup before
    // going live; `tokenId` is filled when the broadcast starts and the coin is
    // actually created — so a stream that never goes live leaves no draft coin
    // behind. See db/stream-coin-columns.sql.
    ticker: text("ticker"),
    tokenId: text("token_id"),
    // Coins the title tags, saved WITH the title as intent — the picker's own
    // state never rehydrates from existing text, so anything not persisted is
    // lost across the reload that routinely separates setup from going live.
    // Re-filtered against the title at go-live. See db/stream-post-columns.sql.
    tags: jsonb("tags").$type<{ network: string; tokenAddress: string; symbol: string; tokenId?: string | null }[]>(),
    // ── What viewers filter and search by (db/stream-discovery-columns.sql) ──
    // Discovery tags, NOT the coin tags above. `tags` (jsonb) is the token
    // picker's; these are Kick/Twitch-style free words ("speedrun", "no mic")
    // that a browse surface can filter on, and conflating the two would put
    // token addresses in a tag pill.
    streamTags: text("stream_tags").array(),
    // BCP-47-ish, whatever the picker offers ("en", "es"). Nullable means
    // "not stated", which is different from English and must stay different.
    language: text("language"),
    // NOT NULL DEFAULT false, deliberately, where the house rule prefers
    // nullable: a null here would read as "maybe mature", and every consumer
    // would have to decide what that means. Safe to add — Postgres 11+ writes
    // a default in the catalog rather than rewriting the table.
    isMature: boolean("is_mature").default(false).notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    viewerCount: integer("viewerCount").default(0).notNull(),
    // Who may talk in this channel's chat, and how long they must have followed
    // first. 'everyone' + 0 is the default and the historical behaviour.
    chatMode: text("chatMode", { enum: ["everyone", "followers", "subscribers"] }).default("everyone").notNull(),
    chatFollowerMinutes: integer("chatFollowerMinutes").default(0).notNull(),
    // Timestamps
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (t) => [
    pgPolicy("owner-all", {
        as: "permissive",
        to: "authenticated",
        for: "all",
        using: sql`auth.uid()::text = ${t.userId}`,
        withCheck: sql`auth.uid()::text = ${t.userId}`,
    }),
    pgPolicy("public-select", {
        as: "permissive",
        to: "anon",
        for: "select",
        using: sql`true`,
    }),
]);
