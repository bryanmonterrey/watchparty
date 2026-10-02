import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user";

export const twoFactor = pgTable("twoFactor", {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backupCodes").notNull(),
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    // better-auth 1.7.7 counts failed TOTP/backup-code attempts here and locks
    // after its maxFailedAttempts; without the column the adapter logs
    // "Drizzle schema mismatch" on every request. db/better-auth-1.7.7-two-factor-failed-count.sql
    failedVerificationCount: integer("failedVerificationCount").notNull().default(0),
    // ...and this is the lock it sets once the count trips (1.7.7).
    // db/better-auth-1.7.7-columns.sql
    lockedUntil: timestamp("lockedUntil"),
}, (table) => [
    index("idx_two_factor_user").on(table.userId),
]);

export type TwoFactor = typeof twoFactor.$inferSelect;
