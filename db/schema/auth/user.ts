import { boolean, index, integer, jsonb, pgEnum, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SocialLinks } from "@/lib/profile/socials";

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
  socials: jsonb("socials").$type<SocialLinks>(),          // platform key -> handle/url (lib/profile/socials.ts)
  accentColor: text("accentColor"),                        // hex; Twitch-style vertical bar on the profile page (null = off)
  role: text("role").default("user").notNull(),
  verifiedTier: verifiedTierEnum("verified_tier"),
  affiliateUsername: text("affiliate_username"),       // org this user is affiliated to (links + drives badge)
  affiliateIconUrl: text("affiliate_icon_url"),         // org logo shown in the affiliate badge square
  gender: boolean("gender").notNull(),
  last_signed_in: timestamp("last_signed_in"),
  lastSeenAt: timestamp("lastSeenAt"),
  showOnlineStatus: boolean("showOnlineStatus").default(true).notNull(),
  dmRequireFollow: boolean("dmRequireFollow").default(false).notNull(),
  hideVerifiedBadge: boolean("hideVerifiedBadge").default(false).notNull(), // opt-out: suppress own checkmark everywhere it renders
  twoFactorEnabled: boolean("twoFactorEnabled").default(false),
  dmPrice: integer("dmPrice"),                         // lamports to unlock DMs (null = free)
  xp: integer("xp").default(0).notNull(),              // lifetime XP; rollup of xp_events (server/lib/xp.ts)
  level: integer("level").default(1).notNull(),        // derived from xp via lib/xp.ts curve
  shareTrades: boolean("shareTrades").default(false).notNull(), // opt-in: trades notify followers + public PnL card/leaderboard
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
