import "server-only";
import { PHOENIX_API_URL, FEED_RANKER_ENABLED, FEED_RANKER_TIMEOUT_MS, PHOENIX_SHARED_SECRET } from "./config";
import { toNumericIdString } from "./ids";

// Maps a watchparty surface name to Phoenix's small-int product_surface vocab.
const SURFACE_IDS: Record<string, number> = {
    home: 0, "for-you": 1, following: 2, trending: 3, shorts: 4, categories: 5, stream: 6, profile: 7,
};
const surfaceId = (s: string) => SURFACE_IDS[s] ?? 0;

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
        ref: string; // watchparty subjectId, echoed back untouched
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

    // Remember each candidate's type by its (unique) subjectId so we can restore
    // it on the response — Phoenix only echoes the opaque `ref`.
    const typeByRef = new Map(input.candidates.map((c) => [c.subjectId, c.subjectType]));
    const ps = surfaceId(input.surface);

    try {
        const res = await fetch(`${PHOENIX_API_URL}/rank`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                ...(PHOENIX_SHARED_SECRET ? { "x-phoenix-secret": PHOENIX_SHARED_SECRET } : {}),
            },
            body: JSON.stringify({
                user_id: toNumericIdString(input.userId),
                history: input.history.map((h) => ({
                    post_id: toNumericIdString(h.postId),
                    author_id: toNumericIdString(h.authorId),
                    actions: h.actions,
                })),
                candidates: input.candidates.map((c) => ({
                    ref: c.subjectId,
                    id: toNumericIdString(c.subjectId),
                    author_id: toNumericIdString(c.authorId),
                    product_surface: ps,
                })),
            }),
            signal: AbortSignal.timeout(FEED_RANKER_TIMEOUT_MS),
        });

        if (!res.ok) return null;
        const data = (await res.json()) as PhoenixRankResponse;
        if (!data.ranked) return null;

        return data.ranked.map((r) => ({
            subjectId: r.ref,
            subjectType: typeByRef.get(r.ref) ?? "post",
            score: r.score,
            actions: r.actions
                ? Object.fromEntries(Object.entries(r.actions).map(([k, v]) => [Number(k), v]))
                : undefined,
        }));
    } catch {
        return null;
    }
}

const secretHeaders = () =>
    PHOENIX_SHARED_SECRET ? { "x-phoenix-secret": PHOENIX_SHARED_SECRET } : {};

/** Item-tower embeddings (128-d) for building the corpus. Used by the corpus cron. */
export async function embedItems(
    items: Array<{ subjectId: string; subjectType: "post" | "stream"; authorId: string | null; surface?: string }>,
): Promise<Array<{ ref: string; vector: number[] }> | null> {
    if (!PHOENIX_API_URL || items.length === 0) return [];
    try {
        const res = await fetch(`${PHOENIX_API_URL}/embed`, {
            method: "POST",
            headers: { "content-type": "application/json", ...secretHeaders() },
            body: JSON.stringify({
                items: items.map((it) => ({
                    ref: it.subjectId,
                    id: toNumericIdString(it.subjectId),
                    author_id: toNumericIdString(it.authorId),
                    product_surface: surfaceId(it.surface ?? "home"),
                })),
            }),
            signal: AbortSignal.timeout(30_000), // batch job, generous
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { embeddings?: Array<{ ref: string; vector: number[] }> };
        return data.embeddings ?? null;
    } catch {
        return null;
    }
}

/** User-tower vector (unit-norm 128-d) to ANN-search the corpus for out-of-network candidates. */
export async function getUserVector(
    userId: string,
    history: HistoryItem[],
): Promise<number[] | null> {
    if (!FEED_RANKER_ENABLED) return null;
    try {
        const res = await fetch(`${PHOENIX_API_URL}/user_vector`, {
            method: "POST",
            headers: { "content-type": "application/json", ...secretHeaders() },
            body: JSON.stringify({
                user_id: toNumericIdString(userId),
                history: history.map((h) => ({
                    post_id: toNumericIdString(h.postId),
                    author_id: toNumericIdString(h.authorId),
                    actions: h.actions,
                })),
            }),
            signal: AbortSignal.timeout(FEED_RANKER_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { vector?: number[] };
        return data.vector ?? null;
    } catch {
        return null;
    }
}
