import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { user } from "./user";

export const twoFactor = pgTable("twoFactor", {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backupCodes").notNull(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
}, (table) => [
    index("idx_two_factor_user").on(table.userId),
]);

export type TwoFactor = typeof twoFactor.$inferSelect;
