// Exports Phoenix ranker training data from feed_signals (+ seen_posts negatives)
// to JSONL, consumed by services/phoenix/training/train.py.
//
//   bun scripts/feed-ranker/export-training-data.mjs > training.jsonl
//
// One line per training example:
//   { user_id, history:[{post_id,author_id,actions}], candidates:[{post_id,author_id,actions}] }
// where candidate `actions` is the LABEL (which engagement happened; {} = a
// negative, i.e. seen-but-not-engaged). History excludes the candidate posts to
// avoid label leakage. IDs are hashed to uint64 (same mapping as the service).

import postgres from "postgres";
import { createHash } from "node:crypto";

const sql = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL, { max: 1, prepare: false });
const toId = (s) => {
    if (!s) return "0";
    const d = createHash("sha1").update(s).digest();
    let v = 0n;
    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(d[i]);
    return (v === 0n ? 1n : v).toString();
};

const HISTORY_LEN = 127;
const MAX_NEG_PER_USER = 50;

// All engagement signals, newest first.
const signals = await sql`
    SELECT "userId", "subjectId", "authorId", "actionType", value, "createdAt"
    FROM feed_signals WHERE "subjectType" = 'post'
    ORDER BY "userId", "createdAt" DESC
`;

// Author lookup for negatives (seen posts that have no signal row).
const negSeen = await sql`
    SELECT s."userId", s."postId", p."userId" AS "authorId"
    FROM seen_posts s JOIN posts p ON p.id = s."postId"
`;

// group signals by user
const byUser = new Map();
for (const r of signals) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId).push(r);
}
const negByUser = new Map();
for (const r of negSeen) {
    if (!negByUser.has(r.userId)) negByUser.set(r.userId, []);
    negByUser.get(r.userId).push(r);
}

let written = 0;
for (const [userId, rows] of byUser) {
    // Collapse per-post action vectors (the positives = candidates).
    const posByPost = new Map();
    for (const r of rows) {
        let p = posByPost.get(r.subjectId);
        if (!p) { p = { post_id: toId(r.subjectId), author_id: toId(r.authorId), _raw: r.subjectId, actions: {} }; posByPost.set(r.subjectId, p); }
        p.actions[r.actionType] = Math.max(p.actions[r.actionType] ?? 0, r.value);
    }
    const positives = [...posByPost.values()];
    if (positives.length === 0) continue;

    // Latest engagement time for this example — used for the temporal train/val
    // split (train on older examples, evaluate on newer = no future leakage).
    const ts = Math.max(...rows.map((r) => new Date(r.createdAt).getTime()));

    const candidatePostIds = new Set(positives.map((p) => p._raw));

    // History = signals on OTHER posts (exclude candidates → no leakage), newest N.
    const history = [];
    const seenHist = new Set();
    for (const r of rows) {
        if (candidatePostIds.has(r.subjectId) || seenHist.has(r.subjectId)) continue;
        seenHist.add(r.subjectId);
        history.push({ post_id: toId(r.subjectId), author_id: toId(r.authorId), actions: { [r.actionType]: r.value } });
        if (history.length >= HISTORY_LEN) break;
    }

    // Negatives: seen-but-not-engaged → empty action label.
    const negs = (negByUser.get(userId) ?? [])
        .filter((n) => !candidatePostIds.has(n.postId))
        .slice(0, MAX_NEG_PER_USER)
        .map((n) => ({ post_id: toId(n.postId), author_id: toId(n.authorId), actions: {} }));

    const candidates = [...positives.map(({ post_id, author_id, actions }) => ({ post_id, author_id, actions })), ...negs];
    process.stdout.write(JSON.stringify({ user_id: toId(userId), ts, history, candidates }) + "\n");
    written++;
}

process.stderr.write(`exported ${written} training examples\n`);
await sql.end();
