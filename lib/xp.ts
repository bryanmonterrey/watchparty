// XP curve + award catalog. Pure/client-safe — the server helper lives in
// server/lib/xp.ts, the ledger in db/schema/content/xp.ts.
// Design doc: docs/exp-callouts.md (Phase 1).

// ─── Award catalog ────────────────────────────────────────────────────────────
// maxPerDay caps how many times a kind can pay out per UTC day (anti-farm).
// XP is only awarded for *received* engagement (you can't farm your own likes —
// enforced at the call sites by never awarding actor == recipient).
// Adding a kind = adding a line here; the DB column is plain text.

export const XP_AWARDS = {
    post_created: { amount: 10, maxPerDay: 5 },
    comment_created: { amount: 5, maxPerDay: 10 },
    like_received: { amount: 2, maxPerDay: 50 },
    follow_received: { amount: 15, maxPerDay: 20 },
    token_launched: { amount: 100, maxPerDay: 2 },
    referral_converted: { amount: 200, maxPerDay: 10 },
} as const satisfies Record<string, { amount: number; maxPerDay: number }>

export type XpKind = keyof typeof XP_AWARDS

// ─── Level curve ──────────────────────────────────────────────────────────────
// Total XP required to *reach* level n: 50·n·(n−1).
// L1=0, L2=100, L3=300, L4=600, L5=1000, L10=4500, L20=19000, L50=122500.
// FROZEN — changing it after launch silently re-levels every user.

export function xpForLevel(level: number): number {
    return 50 * level * (level - 1)
}

export function levelForXp(xp: number): number {
    if (xp <= 0) return 1
    // Invert 50·n·(n−1) ≤ xp, then nudge for float edges at exact thresholds.
    let level = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2)
    while (xpForLevel(level + 1) <= xp) level++
    while (level > 1 && xpForLevel(level) > xp) level--
    return level
}

/** Progress within the current level, for profile UI. */
export function xpProgress(xp: number): { level: number; inLevel: number; forNext: number; pct: number } {
    const level = levelForXp(xp)
    const floor = xpForLevel(level)
    const ceil = xpForLevel(level + 1)
    const inLevel = xp - floor
    const forNext = ceil - floor
    return { level, inLevel, forNext, pct: Math.min(100, (inLevel / forNext) * 100) }
}
