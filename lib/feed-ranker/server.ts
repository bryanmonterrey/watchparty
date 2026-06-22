import "server-only";
import { PHOENIX_API_URL, FEED_RANKER_ENABLED, FEED_RANKER_TIMEOUT_MS } from "./config";

// Server-side bridge to the Phoenix ranking service (FastAPI on Cloud Run).
// Called only from the feed router / /api/feed/* handlers, never the browser —
// same shape as lib/ads/server.ts (fetchAd). On disabled/timeout/error it
// returns null so callers transparently fall back to reverse-chronological.

/** One item in the user's engagement history, in Phoenix's action schema. */
export interface HistoryItem {
    postId: string;
    authorId: string | null;
    /** Phoenix action index → magnitude (1=fav, 4=reply, 6=repost, 11=dwell, …). */
    actions: Record<number, number>;
}

/** A candidate to be ranked (post or live stream, namespaced by type). */
export interface Candidate {
    subjectId: string;
    subjectType: "post" | "stream";
    authorId: string | null;
}

export interface RankInput {
    userId: string;
    history: HistoryItem[];
    candidates: Candidate[];
    surface: string; // "home" | "shorts" | ...
}

/** Phoenix returns, per candidate, a logit/probability for each action type. */
export interface RankedCandidate {
    subjectId: string;
    subjectType: "post" | "stream";
    /** Combined ranking score (engagement-weighted sum of per-action probs). */
    score: number;
    /** Raw per-action probabilities, for diagnostics / downstream boosts. */
    actions?: Record<number, number>;
}

interface PhoenixRankResponse {
    ranked?: Array<{
        subject_id: string;
        subject_type?: "post" | "stream";
        score: number;
        actions?: Record<string, number>;
    }>;
}

/**
 * Rank candidates for a user via Phoenix. Returns candidates in ranked order,
 * or null when the ranker is disabled or unavailable (caller falls back).
 */
export async function rankCandidates(input: RankInput): Promise<RankedCandidate[] | null> {
    if (!FEED_RANKER_ENABLED) return null;
    if (input.candidates.length === 0) return [];

    try {
        const res = await fetch(`${PHOENIX_API_URL}/rank`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                user_id: input.userId,
                surface: input.surface,
                history: input.history.map((h) => ({
                    post_id: h.postId,
                    author_id: h.authorId,
                    actions: h.actions,
                })),
                candidates: input.candidates.map((c) => ({
                    subject_id: c.subjectId,
                    subject_type: c.subjectType,
                    author_id: c.authorId,
                })),
            }),
            signal: AbortSignal.timeout(FEED_RANKER_TIMEOUT_MS),
        });

        if (!res.ok) return null;
        const data = (await res.json()) as PhoenixRankResponse;
        if (!data.ranked) return null;

        return data.ranked.map((r) => ({
            subjectId: r.subject_id,
            subjectType: r.subject_type ?? "post",
            score: r.score,
            actions: r.actions
                ? Object.fromEntries(Object.entries(r.actions).map(([k, v]) => [Number(k), v]))
                : undefined,
        }));
    } catch {
        return null;
    }
}
