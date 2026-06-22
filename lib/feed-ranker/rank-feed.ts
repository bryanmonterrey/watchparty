import "server-only";
import { rankCandidates } from "./server";
import { getUserHistory } from "./history";
import { FEED_RANKER_ENABLED } from "./config";

// Reorders a pool of candidate rows by Phoenix ranking. Surface-agnostic so the
// for-you feed, homepage carousels, and shorts can all share it. Returns the
// rows reordered (best-first), or null to signal the caller should keep its
// existing (chronological) order — disabled, no user, or service unavailable.
//
// The caller owns candidate SOURCING (which posts/streams to consider) and
// PAGINATION; this only handles history assembly + the rank call + reordering,
// plus the crypto/ticker boost watchparty layers on top of the model score.

interface RankableRow {
    id: string;
    userId: string;            // author
    subjectType?: "post" | "stream";
    ticker?: string | null;    // crypto signal
    tokenStatus?: string | null;
}

// Multiplicative boost for crypto content — crypto Twitter rewards live tokens.
// Applied to the model's score AFTER ranking, so it's tunable without retraining.
const TICKER_BOOST = 1.15;
const LIVE_TOKEN_BOOST = 1.30;

export async function rankFeedRows<T extends RankableRow>(
    userId: string | undefined,
    surface: string,
    rows: T[],
): Promise<T[] | null> {
    if (!FEED_RANKER_ENABLED || !userId || rows.length === 0) return null;

    const history = await getUserHistory(userId);
    const ranked = await rankCandidates({
        userId,
        surface,
        history,
        candidates: rows.map((r) => ({
            subjectId: r.id,
            subjectType: r.subjectType ?? "post",
            authorId: r.userId,
        })),
    });
    if (!ranked) return null; // service down → caller keeps chronological order

    // score by subjectId, with crypto boost folded in
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const scored = ranked.map((r) => {
        const row = rowById.get(r.subjectId);
        let score = r.score;
        if (row?.ticker) score *= TICKER_BOOST;
        if (row?.tokenStatus === "live") score *= LIVE_TOKEN_BOOST;
        return { id: r.subjectId, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // Map back to full rows; any candidate the ranker dropped is appended in
    // original order so nothing silently disappears.
    const seen = new Set(scored.map((s) => s.id));
    const reordered = scored.map((s) => rowById.get(s.id)).filter(Boolean) as T[];
    for (const r of rows) if (!seen.has(r.id)) reordered.push(r);
    return reordered;
}
