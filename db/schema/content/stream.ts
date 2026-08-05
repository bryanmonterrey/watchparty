import { pgTable, pgPolicy, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
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
