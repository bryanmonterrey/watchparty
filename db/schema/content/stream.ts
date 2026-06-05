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
    thumbnailUrl: text("thumbnailUrl"),
    viewerCount: integer("viewerCount").default(0).notNull(),
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
