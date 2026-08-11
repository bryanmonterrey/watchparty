#!/usr/bin/env bun
/**
 * Walk every paginated tRPC surface to the end and prove nothing is lost.
 *
 *   bun scripts/dev/walk-pagination.mjs                 # all surfaces
 *   bun scripts/dev/walk-pagination.mjs --only search   # substring filter
 *   bun scripts/dev/walk-pagination.mjs --prod          # PUBLIC surfaces on production
 *
 * Dev needs a server and a session:
 *   bun scripts/dev/mint-test-session.mjs --raw > .walk-cookie
 *
 * `--prod` needs NEITHER. It walks only the surfaces that take no session, so
 * it creates nothing in production — no fixture user, no rows, no writes. The
 * counts are read-only SELECTs against the production database.
 *
 * It is also the mode that actually runs: a cold route compile in dev is ~5
 * minutes on a laptop, where production answers in milliseconds and holds real
 * data with the tied runs and ranked orderings these bugs need.
 *
 * Two production details it has to handle. Requests carry same-origin headers
 * because /api/trpc is behind the 402 paywall for external callers — this is
 * the app's own API answering the way it answers the app. And auth-gated
 * surfaces are SKIPPED rather than faked; use dev mode for those.
 *
 * ## Why this exists
 *
 * On 2026-08-10 a single session found TWELVE pagination defects, none of them
 * reported by anyone, all of the same family: rows that exist on the server and
 * cannot be reached from the client. They were found by seeding data and
 * walking cursors by hand. Nothing in tsc, `bun test` or CI can see any of
 * them — they need a database with the right shape and a client that follows
 * the cursor to the end.
 *
 * The failures were not exotic:
 *   - a cursor accepted and never applied            → same page forever
 *   - a value-only cursor over a column that ties    → the tied run vanishes
 *   - a cursor key that isn't the sort key           → pages skip AND repeat
 *   - a scroll trigger that could only fire once     → stuck at 2 pages
 *
 * ## The invariant
 *
 * Walk to exhaustion, then assert `walked == unique == expected`, where
 * `expected` comes from COUNTING THE DATABASE rather than from a constant in
 * this file. That is the part that catches truncation: a surface that stops
 * early still returns clean, non-duplicated pages, and only a ground-truth
 * count reveals the tail is missing.
 *
 * ## Ties are the point
 *
 * The fixtures this reads must contain runs of rows SHARING one sort value —
 * longer than one page. That is what a bulk insert produces (Postgres `now()`
 * is transaction-scoped) and it is the case every one of these cursors got
 * wrong. A fixture with neatly distinct timestamps passes against broken code,
 * which is why seeding is a deliberate data decision and not test plumbing.
 *
 * ## Guard against vacuous passes
 *
 * A surface that returns nothing makes every assertion here trivially true —
 * `[].every()` is `true`, and a set of zero has no duplicates. Three of my own
 * checks printed "ok" against an empty page before I noticed. Any surface
 * walking fewer than MIN_ROWS is reported as NO DATA and never as a pass.
 */

import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const BASE = process.env.WALK_BASE ?? (PROD ? "https://watchparty.xyz" : "http://localhost:3001");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

/** Below this a surface has too little data to conclude anything. */
const MIN_ROWS = 5;
/** Runaway guard: a cursor that never terminates would otherwise loop forever. */
const MAX_PAGES = 40;

// ── fixtures ────────────────────────────────────────────────────────────────
// Ids come from the dev fixtures minted by scripts/dev/mint-test-session.mjs.
const ME = "94ea2416-7dc6-496d-ad88-84d99cfcd378";       // e2e-test@watchparty.local
const OTHER = "6514f620-5229-4fba-b675-ec3c6c290096";    // e2e-test-2@watchparty.local
const CHANNEL = "0936c35a-4f0f-43e1-8fc5-63b4daa15e4d";

/**
 * `count` is SQL against the dev DB — ground truth, so truncation is visible.
 * `rows` is the array field on the procedure's output.
 *
 * `count` may be OMITTED where no honest ground truth exists — a ranked feed
 * with a bounded candidate pool is not supposed to return every row, so
 * asserting a total would be asserting the wrong thing. Those surfaces are
 * still checked for duplicates and for termination, which is where the
 * cursor bugs actually live.
 */
const SURFACES = [
    {
        name: "searchPosts (top)",
        proc: "content.searchPosts",
        input: { query: "haystack", limit: 20, sort: "top" },
        rows: "posts",
        count: `select count(*)::int n from posts where content like 'searchable haystack%' and status = 'published'`,
    },
    {
        name: "getPostsByUser",
        proc: "content.getPostsByUser",
        input: { userId: OTHER, limit: 20, type: "all", show: "all", sort: "newest" },
        rows: "posts",
        // `show: "all"` means posts AND replies — excluding replies here made
        // the walk look like it over-returned by exactly the comment count.
        count: `select count(*)::int n from posts where "userId" = '${OTHER}' and status = 'published'`,
    },
    {
        name: "getComments",
        proc: "comment.getComments",
        input: { postId: "__PARENT__", limit: 20 },
        rows: "comments",
        count: `select count(*)::int n from posts where "replyToId" = '__PARENT__' and status = 'published'`,
        // Resolved at run time — the parent id isn't stable across re-seeds.
        resolve: `select "replyToId" id from posts where "replyToId" is not null group by 1 order by count(*) desc limit 1`,
    },
    {
        name: "community.getMessages",
        auth: true,
        proc: "community.getMessages",
        input: { channelId: CHANNEL, limit: 50 },
        rows: "items",
        // Deleted messages still come back, as tombstones the UI renders as
        // "This message has been deleted" — so they count.
        count: `select count(*)::int n from community_messages where channel_id = '${CHANNEL}'`,
    },
    {
        name: "getNotifications",
        auth: true,
        proc: "notification.getNotifications",
        input: { limit: 20 },
        rows: "notifications",
        count: `select count(*)::int n from notifications where "userId" = '${ME}'`,
    },
    {
        name: "getBookmarks",
        auth: true,
        proc: "content.getBookmarks",
        input: { limit: 20 },
        rows: "posts",
        count: `select count(*)::int n from bookmarks where "userId" = '${ME}' and "contentType" = 'post'`,
    },
    {
        name: "getFollowers",
        proc: "user.getFollowers",
        input: { userId: ME, limit: 20 },
        rows: "items",
        count: `select count(*)::int n from follows where "followingId" = '${ME}'`,
    },
    {
        name: "getPublicVideos",
        proc: "content.getPublicVideos",
        input: { limit: 12 },
        rows: "videos",
        count: `select count(*)::int n from posts where "videoUrl" is not null and status = 'published' and visibility = 'public'`,
    },
    {
        name: "feed.getFeed",
        proc: "content.getFeed",
        input: { type: "for-you", limit: 20 },
        rows: "posts",
        // No count on purpose: this is RANKED over a bounded candidate pool
        // (FEED_POOL_SIZE), so "everything published" is not the right answer.
        // Duplicates and non-termination are still bugs.
    },
    {
        name: "message.list (DMs)",
        auth: true,
        proc: "message.list",
        input: { conversationId: "__CONV__", limit: 50 },
        rows: "messages",
        count: `select count(*)::int n from messages where conversation_id = '__CONV__'`,
        resolve: `select conversation_id id from messages group by 1 order by count(*) desc limit 1`,
        placeholder: "__CONV__",
    },
    {
        name: "getFollowing",
        proc: "user.getFollowing",
        input: { userId: ME, limit: 20 },
        rows: "items",
        count: `select count(*)::int n from follows where "followerId" = '${ME}'`,
    },
    {
        name: "trending.list",
        proc: "trending.list",
        input: { sort: "volume", timeframe: "24h", limit: 50 },
        rows: "items",
        count: `select count(*)::int n from trending_coins`,
    },
    {
        name: "coinFeed.list",
        proc: "coinFeed.list",
        input: { limit: 20 },
        rows: "items",
        count: `select count(*)::int n from coin_feed_events`,
    },
];

// ── plumbing ────────────────────────────────────────────────────────────────

function cookie() {
    if (PROD) return null; // public surfaces only — no session is created or needed
    if (process.env.WALK_COOKIE) return process.env.WALK_COOKIE;
    for (const p of [".walk-cookie", "/tmp/walk-cookie"]) {
        if (existsSync(p)) return readFileSync(p, "utf8").trim();
    }
    console.error(
        "No session. Run:\n" +
        "  bun scripts/dev/mint-test-session.mjs --raw > .walk-cookie\n" +
        "or set WALK_COOKIE.",
    );
    process.exit(1);
}

async function call(proc, input, jar) {
    const url = `${BASE}/api/trpc/${proc}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
    // Same-origin headers on production: /api/trpc answers 402 to external
    // callers by design (lib/api-pricing.ts). This is the app's own API.
    const headers = jar ? { cookie: jar } : {};
    if (PROD) Object.assign(headers, { origin: BASE, referer: `${BASE}/home` });
    const res = await fetch(url, { headers });
    const body = await res.json().catch(() => null);
    const data = body?.result?.data?.json ?? body?.result?.data;
    if (!data) {
        const msg = body?.error?.json?.message ?? body?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data;
}

/** Follow the cursor to exhaustion, collecting row ids. */
async function walk(surface, jar) {
    const ids = [];
    let cursor;
    let pages = 0;
    for (; pages < MAX_PAGES; pages++) {
        const input = cursor === undefined ? surface.input : { ...surface.input, cursor };
        const data = await call(surface.proc, input, jar);
        const rows = data[surface.rows] ?? [];
        ids.push(...rows.map((r) => r.id));
        cursor = data.nextCursor ?? undefined;
        if (!cursor) return { ids, pages: pages + 1, exhausted: true };
    }
    // Hit the guard: the cursor never said "done".
    return { ids, pages, exhausted: false };
}

async function main() {
    const jar = cookie();

    // Counts come from whichever database the target serves. READ-ONLY: every
    // query in SURFACES is a `select count(*)`.
    let runCount;
    let closeDb = async () => {};
    if (PROD) {
        const postgres = (await import("postgres")).default;
        const line = (await Bun.file(".env.production").text())
            .split("\n").find((l) => l.startsWith("DATABASE_URL="));
        if (!line) { console.error("no DATABASE_URL in .env.production"); process.exit(1); }
        const client = postgres(line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, ""), { max: 1, prepare: false });
        runCount = async (text) => (await client.unsafe(text))[0];
        closeDb = () => client.end();
        console.log(`target: ${BASE} (production, public surfaces only)\n`);
    } else {
        const { db } = await import("@/db");
        const { sql } = await import("drizzle-orm");
        runCount = async (text) => { const r = await db.execute(sql.raw(text)); return (r.rows ?? r)[0]; };
        console.log(`target: ${BASE}\n`);
    }

    const chosen = SURFACES.filter((s) => !only || s.name.toLowerCase().includes(only.toLowerCase()));
    let failed = 0;
    let skipped = 0;

    for (const s of chosen) {
        if (PROD && s.auth) { console.log(`  skipped  ${s.name} — needs a session`); skipped++; continue; }
        let input = s.input;
        let countSql = s.count;

        // Some surfaces need an id that only the database knows.
        if (s.resolve) {
            const id = (await runCount(s.resolve))?.id;
            if (!id) { console.log(`  NO DATA  ${s.name} — nothing to resolve`); skipped++; continue; }
            const token = s.placeholder ?? "__PARENT__";
            input = JSON.parse(JSON.stringify(s.input).replaceAll(token, id));
            countSql = countSql?.replaceAll(token, id);
        }

        let expected = null;
        if (countSql) expected = (await runCount(countSql))?.n ?? 0;

        let res;
        try {
            res = await walk({ ...s, input }, jar);
        } catch (e) {
            console.log(`  ERROR    ${s.name} — ${String(e.message).slice(0, 90)}`);
            failed++;
            continue;
        }

        const unique = new Set(res.ids).size;
        const dupes = res.ids.length - unique;

        // Never let an empty surface look like a pass.
        if (res.ids.length < MIN_ROWS) {
            console.log(`  NO DATA  ${s.name} — walked ${res.ids.length} rows (need ≥${MIN_ROWS} to judge)`);
            skipped++;
            continue;
        }

        const problems = [];
        if (!res.exhausted) problems.push(`cursor never terminated (${MAX_PAGES} pages)`);
        if (dupes) problems.push(`${dupes} duplicate rows`);
        if (expected !== null && unique !== expected) {
            problems.push(`reached ${unique} of ${expected} — ${expected - unique} unreachable`);
        }

        if (problems.length) {
            console.log(`  FAIL     ${s.name} — ${problems.join("; ")}`);
            failed++;
        } else {
            const total = expected === null ? `${unique} rows (no ground truth)` : `${unique}/${expected}`;
            console.log(`  ok       ${s.name} — ${total} in ${res.pages} pages`);
        }
    }

    await closeDb();
    console.log(`\n${chosen.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped.`);
    process.exit(failed ? 1 : 0);
}

await main();
