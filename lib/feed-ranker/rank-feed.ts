import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { rankCandidates } from "./server";
import { getUserHistory } from "./history";
import { FEED_RANKER_ENABLED } from "./config";
import { withCache } from "@/lib/cache";
import { db } from "@/db";
import { follows } from "@/db/schema";

// Cache the expensive part (history assembly + Phoenix /rank) per
// (user, surface, candidate-set). Repeated feed loads + pagination over the same
// pool reuse one ranking instead of re-hitting Phoenix every time — the hot-path
// mitigation. Short TTL so engagement still moves the feed quickly. The cheap
// crypto-boost + reorder run fresh on every call (not cached).
const RANK_TTL = 45; // seconds

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

// X production's bidirectional-follow reply boost (home-mixer param.rs:
// rust_home_mixer_bidirectional_follow_reply_weight_boost = 15.0): a predicted
// reply to a mutual-follow author counts 20x a like instead of 10x. Applied
// here, not in the service, because only the edge knows the follow graph.
// Posts only — stream "replies" aren't the same interaction.
const BIDIRECTIONAL_REPLY_BOOST = 15.0;
const IDX_REPLY = 4; // SERVER_TWEET_REPLY in the per-action probs

// Authors among `authorIds` in a mutual follow with the viewer: two indexed
// lookups + a set intersection (avoids a drizzle self-join alias — see the
// alias() type incident in CLAUDE.md).
async function getMutualFollowAuthors(userId: string, authorIds: string[]): Promise<Set<string>> {
    if (authorIds.length === 0) return new Set();
    try {
        const [iFollow, followMe] = await Promise.all([
            db.select({ id: follows.followingId }).from(follows)
                .where(and(eq(follows.followerId, userId), inArray(follows.followingId, authorIds))),
            db.select({ id: follows.followerId }).from(follows)
                .where(and(eq(follows.followingId, userId), inArray(follows.followerId, authorIds))),
        ]);
        const back = new Set(followMe.map((r) => r.id));
        return new Set(iFollow.map((r) => r.id).filter((id) => back.has(id)));
    } catch {
        return new Set(); // boost is best-effort; never fail the feed over it
    }
}

export async function rankFeedRows<T extends RankableRow>(
    userId: string | undefined,
    surface: string,
    rows: T[],
): Promise<T[] | null> {
    if (!FEED_RANKER_ENABLED || !userId || rows.length === 0) return null;

    // Content-addressed cache key: same user + surface + candidate set → same
    // ranking, regardless of anchor-timestamp jitter between requests.
    const candKey = createHash("sha1")
        .update(rows.map((r) => r.id).sort().join(","))
        .digest("hex")
        .slice(0, 16);
    const cacheKey = `feedrank:${userId}:${surface}:${candKey}`;

    // On a miss, assemble history + call Phoenix. A null result (service down) is
    // treated by withCache as a miss, so failures aren't cached and retry next call.
    const ranked = await withCache(cacheKey, RANK_TTL, async () => {
        const history = await getUserHistory(userId);
        return rankCandidates({
            userId,
            surface,
            history,
            candidates: rows.map((r) => ({
                subjectId: r.id,
                subjectType: r.subjectType ?? "post",
                authorId: r.userId,
            })),
        });
    });
    if (!ranked) return null; // service down → caller keeps chronological order

    // Mutual-follow set is fetched fresh (cheap, indexed) because the ranked
    // result is cached across users' follow-graph changes.
    const mutual = await getMutualFollowAuthors(
        userId,
        [...new Set(rows.map((r) => r.userId).filter(Boolean))],
    );

    // score by subjectId: additive reply boost first (part of the engagement
    // blend), then watchparty's multiplicative crypto boost on top.
    //
    // The multiplier is applied ONLY to a positive score. Since the blend gained
    // negative weights (report -234, not-interested -43.2) a score can now be
    // negative, and multiplying a negative by 1.15 pushes it FURTHER down — the
    // boost would silently invert into a penalty, hitting exactly the crypto
    // posts it is meant to promote. Multiplicative boosts are only monotonic on
    // the positive side.
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const scored = ranked.map((r) => {
        const row = rowById.get(r.subjectId);
        let score = r.score;
        const replyP = r.actions?.[IDX_REPLY];
        if (replyP && row && (row.subjectType ?? "post") === "post" && mutual.has(row.userId)) {
            score += BIDIRECTIONAL_REPLY_BOOST * replyP;
        }
        if (score > 0) {
            if (row?.ticker) score *= TICKER_BOOST;
            if (row?.tokenStatus === "live") score *= LIVE_TOKEN_BOOST;
        }
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
