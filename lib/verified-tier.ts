import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

// "Hide checkmark" (owner decision 2026-07-20): computed once at the query
// source so every render site (post cards, feed, profile, popouts) just
// keeps checking `.verifiedTier` like before — nulling it out here means no
// client component needs to know the setting exists. NOT applied in
// admin.ts, which needs the real tier for moderation regardless of what the
// user chose to display publicly.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function effectiveVerifiedTier(tierCol: PgColumn<any>, hideCol: PgColumn<any>): SQL<"verified" | "business" | "government" | null> {
    return sql`CASE WHEN ${hideCol} THEN NULL ELSE ${tierCol} END`;
}
