// Earned-badge catalog. Pure/client-safe — the server computation lives in
// server/lib/badges.ts, reading only tables that already exist (plus
// weekly_finishes for board finishes). Like quests, definitions are code:
// adding a badge = adding a line here + a compute branch server-side.
//
// Strip rules (docs/design-brief-2026-07.md §1 + the Discord reference):
// earned-only — premium tier is the only "paid" badge; catalog order below IS
// the display/priority order (chat shows the first earned badge as the "top"
// badge). Accent families: lantern = trading, sunset = caller, pastels = social.

export type BadgeFamily = "caller" | "trading" | "social" | "premium"

export interface BadgeDef {
    id: BadgeId
    name: string
    /** Tooltip line under the name. */
    description: string
    family: BadgeFamily
}

export type BadgeId =
    | "top_caller"      // top-3 weekly Top Caller finish (weekly_finishes)
    | "top_trader"      // top-3 weekly Top Trader finish (weekly_finishes)
    | "callout_sniper"  // a callout hit 10×
    | "prophet"         // won a prediction market bet
    | "profitable"      // sharing trades with positive 30d realized PnL
    | "token_launcher"  // launched a live token
    | "premium"         // active platform premium subscription
    | "level_50" | "level_20" | "level_10" | "level_5" // highest tier only
    | "quest_streak"    // 7 consecutive days of completed daily quests
    | "early_member"    // among the first 1,000 accounts

export const BADGE_CATALOG: readonly BadgeDef[] = [
    { id: "top_caller", name: "Top Caller", description: "Finished top 3 on the weekly caller board", family: "caller" },
    { id: "top_trader", name: "Top Trader", description: "Finished top 3 on the weekly trader board", family: "trading" },
    { id: "callout_sniper", name: "Sniper", description: "Called a token before it did a 10×", family: "caller" },
    { id: "prophet", name: "Prophet", description: "Won a prediction market", family: "social" },
    { id: "profitable", name: "In Profit", description: "Positive 30-day realized PnL, trades shared", family: "trading" },
    { id: "token_launcher", name: "Launcher", description: "Launched a token on watchparty", family: "trading" },
    { id: "premium", name: "Premium", description: "Premium member", family: "premium" },
    { id: "level_50", name: "Level 50", description: "Reached level 50", family: "social" },
    { id: "level_20", name: "Level 20", description: "Reached level 20", family: "social" },
    { id: "level_10", name: "Level 10", description: "Reached level 10", family: "social" },
    { id: "level_5", name: "Level 5", description: "Reached level 5", family: "social" },
    { id: "quest_streak", name: "Streak", description: "Completed daily quests 7 days in a row", family: "social" },
    { id: "early_member", name: "Early", description: "One of the first 1,000 members", family: "social" },
] as const

export const BADGE_BY_ID: Record<BadgeId, BadgeDef> = Object.fromEntries(
    BADGE_CATALOG.map((b) => [b.id, b])
) as Record<BadgeId, BadgeDef>

/** What profile.card returns per earned badge. */
export interface EarnedBadge {
    id: BadgeId
    /** ISO date, when derivable (level tiers have none). */
    earnedAt: string | null
    /** Small factoid for the tooltip, e.g. "best finish #1 · 3 weeks". */
    detail?: string
}

/** How many glyphs the strip shows before collapsing to "+N". */
export const BADGE_STRIP_MAX = 6

/** LV cutoffs that map user.level → the (single) level-tier badge. */
export function levelBadgeId(level: number): BadgeId | null {
    if (level >= 50) return "level_50"
    if (level >= 20) return "level_20"
    if (level >= 10) return "level_10"
    if (level >= 5) return "level_5"
    return null
}

/** Signup-order cutoff for the early-member badge (owner decision 2026-07-19). */
export const EARLY_MEMBER_CUTOFF = 1000
