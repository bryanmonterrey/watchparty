import { boolean, index, integer, pgEnum, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const verifiedTierEnum = pgEnum("verified_tier", ["verified", "business", "government"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  wallet_address: text("wallet_address"),
  avatar_url: text("avatar_url"),
  banner_url: text("banner_url"),
  bio: text("bio"),
  location: text("location"),
  website: text("website"),
  role: text("role").default("user").notNull(),
  verifiedTier: verifiedTierEnum("verified_tier"),
  gender: boolean("gender").notNull(),
  last_signed_in: timestamp("last_signed_in"),
  lastSeenAt: timestamp("lastSeenAt"),
  showOnlineStatus: boolean("showOnlineStatus").default(true).notNull(),
  dmRequireFollow: boolean("dmRequireFollow").default(false).notNull(),
  twoFactorEnabled: boolean("twoFactorEnabled").default(false),
  dmPrice: integer("dmPrice"),                         // lamports to unlock DMs (null = free)
  referralCode: text("referralCode"),                  // auto-generated code for referrals
  referredBy: text("referredBy"),                      // userId who referred this user
  banned: boolean("banned"),
  banReason: text("banReason"),
  banExpires: timestamp("banExpires"),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("idx_user_wallet_address").on(table.wallet_address),
  index("idx_user_username").on(table.username),
  index("idx_user_referral_code").on(table.referralCode),
  pgPolicy("users_select_public", { for: "select", to: "public", using: sql`true` }),
  pgPolicy("users_update_own", { for: "update", to: "authenticated", using: sql`id = (SELECT auth.uid()::text)` }),
]).enableRLS();

export type UserType = typeof user.$inferSelect;
