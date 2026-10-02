import { index, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  // better-auth 1.7.0–1.7.2 keyed an account on (issuer, accountId). 1.7.3+
  // went back to (providerId, accountId) and no longer writes this column at
  // all, so it must be nullable or every account insert fails — 1.7.7's schema
  // check refuses to serve a request while it is NOT NULL. Kept (not dropped)
  // so a rollback to 1.7.1 still finds its key: the `account_fill_issuer`
  // trigger derives it on insert for rows 1.7.7 creates, otherwise 1.7.1 would
  // miss those accounts and mint a duplicate user on their next sign-in.
  // See db/better-auth-1.7.7-columns.sql.
  issuer: text("issuer"),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("idx_account_userid").on(table.userId),
  uniqueIndex("account_issuer_accountId_unique").on(table.issuer, table.accountId),
  pgPolicy("accounts_select_own", { for: "select", to: "authenticated", using: sql`"userId" = (SELECT auth.uid()::text)` }),
]).enableRLS();
