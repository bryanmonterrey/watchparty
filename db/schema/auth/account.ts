import { index, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./user";

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  // better-auth >=1.7 keys an account on (issuer, accountId) rather than
  // accountId alone, so a provider id can't collide across auth methods.
  // Values are derived, never free-form: an OAuth provider that declares its
  // own issuer uses it (of ours, only Google — https://accounts.google.com),
  // any other OAuth provider gets `local:oauth:<providerId>`, and local methods
  // (siws, siwe, credential) get `local:<providerId>`. See db/better-auth-1.7.sql.
  issuer: text("issuer").notNull(),
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
