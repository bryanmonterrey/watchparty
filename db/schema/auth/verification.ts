import { pgTable, pgPolicy, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date()),
}, () => [
    // Server-only table — accessed via service role only
    pgPolicy('verification_deny_direct_access', { for: 'all', to: ['authenticated', 'anon'], using: sql`false` }),
]).enableRLS();
