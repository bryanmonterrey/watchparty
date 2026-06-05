import { index, pgPolicy, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { user } from "../auth/user"
import { posts } from "./post"

export const videoProgress = pgTable("video_progress", {
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    postId: text("postId").notNull().references(() => posts.id, { onDelete: "cascade" }),
    currentTime: real("currentTime").notNull().default(0),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
}, (table) => [
    primaryKey({ columns: [table.userId, table.postId] }),
    index("idx_video_progress_user").on(table.userId),
    pgPolicy("video_progress_owner_all", { for: "all", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS()
