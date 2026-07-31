// Quest catalog + period keys. Pure/client-safe — the progress engine lives in
// server/lib/quests.ts, the table in db/schema/content/quest.ts.
// Design doc: docs/exp-callouts.md (Phase 3).
//
// Quests are code-defined: adding/retiring one is a deploy, not a migration.
// periodKey scopes a progress row to its window ("2026-07-13" / "2026-W28"),
// so daily/weekly "resets" are free — a new window is just a fresh row.

export type QuestPeriod = "daily" | "weekly";

// Events quests can track. Superset of XP kinds (callout_created isn't an XP
// award — making a call pays via the 2x/5x/10x bonuses, not the act itself).
export type QuestEvent =
    | "post_created"
    | "comment_created"
    | "like_received"
    | "follow_received"
    | "token_launched"
    | "callout_created"
    | "prediction_bet"
    | "perps_trade";

export interface QuestDef {
    id: string;
    title: string;
    event: QuestEvent;
    target: number;
    xpReward: number;
    period: QuestPeriod;
}

export const QUESTS: QuestDef[] = [
    { id: "daily_post", title: "Make a post", event: "post_created", target: 1, xpReward: 25, period: "daily" },
    { id: "daily_comments", title: "Leave 3 comments", event: "comment_created", target: 3, xpReward: 30, period: "daily" },
    { id: "daily_callout", title: "Call out a coin", event: "callout_created", target: 1, xpReward: 40, period: "daily" },
    { id: "weekly_posts", title: "Post 10 times", event: "post_created", target: 10, xpReward: 150, period: "weekly" },
    { id: "weekly_likes", title: "Collect 25 likes", event: "like_received", target: 25, xpReward: 150, period: "weekly" },
    { id: "weekly_followers", title: "Gain 5 followers", event: "follow_received", target: 5, xpReward: 200, period: "weekly" },
    { id: "weekly_launch", title: "Launch a coin", event: "token_launched", target: 1, xpReward: 250, period: "weekly" },
    { id: "daily_prediction", title: "Back a prediction", event: "prediction_bet", target: 1, xpReward: 30, period: "daily" },
    { id: "weekly_predictions", title: "Place 5 prediction bets", event: "prediction_bet", target: 5, xpReward: 150, period: "weekly" },
    { id: "daily_perps", title: "Open a perps position", event: "perps_trade", target: 1, xpReward: 40, period: "daily" },
    { id: "weekly_perps", title: "Open 10 perps positions", event: "perps_trade", target: 10, xpReward: 200, period: "weekly" },
];

/** "2026-07-13" (UTC) for daily; ISO week "2026-W28" for weekly. */
export function periodKeyFor(period: QuestPeriod, date = new Date()): string {
    if (period === "daily") return date.toISOString().slice(0, 10);
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay() || 7; // ISO: Monday=1 … Sunday=7
    d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday decides the ISO year
    const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** When the current window rolls over (for the countdown UI). */
export function periodResetAt(period: QuestPeriod, date = new Date()): Date {
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    if (period === "daily") return next;
    const day = date.getUTCDay() || 7;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + (8 - day)));
}
