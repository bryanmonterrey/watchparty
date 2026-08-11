#!/usr/bin/env node
// Real DB smoke for the Phase-9 filtered-stream delivery path (the part tsc and
// the rule-engine unit tests can't see): does developer_stream_deliveries store
// and hand back rows the way GET /api/stream/events reads them?
//
//   - bigserial `seq` comes back usable + monotonic (the cursor),
//   - jsonb `payload` round-trips,
//   - the `seq > since` cursor filter and ORDER BY / LIMIT behave.
//
// Runs against the DEV project only (DIRECT_URL from .env.local); inserts a few
// rows under a synthetic app id tied to a real user (FK), asserts, and cleans
// up after itself. Hard-refuses the prod ref.
//
//   node scripts/db/../dev/smoke-stream-pull.mjs      (or: node scripts/dev/smoke-stream-pull.mjs)

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

function readEnv(file, key) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { return null; }
    const line = text.split("\n").find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).replace(/^["']|["']$/g, "").trim() : null;
}

const url = readEnv(".env.local", "DIRECT_URL") ?? readEnv(".env.local", "DATABASE_URL");
if (!url) { console.error("no DIRECT_URL/DATABASE_URL in .env.local"); process.exit(1); }
if (url.includes("ugpzuypoyeuiebqbzqcm")) { console.error("REFUSING: that's the prod ref"); process.exit(1); }

const ref = decodeURIComponent(url.replace(/.*\/\/([^:]+):.*/, "$1")).split(".")[1] ?? "?";
console.log(`smoke against project ${ref}`);

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const appId = `smoke_${randomBytes(6).toString("hex")}`;
let failures = 0;
const check = (name, ok) => { console.log(`  ${ok ? "✓" : "✗"} ${name}`); if (!ok) failures++; };

try {
    const [u] = await sql`select id from "user" limit 1`;
    if (!u) { console.error("no user rows in dev to attach the FK to"); process.exit(1); }

    // Insert three deliveries, capturing their seqs in insertion order.
    const inserted = [];
    for (let i = 0; i < 3; i++) {
        const [row] = await sql`
            insert into developer_stream_deliveries (user_id, app_id, event_type, tag, payload)
            values (${u.id}, ${appId}, ${"coin.launched"}, ${`t${i}`}, ${sql.json({ ticker: "PARTY", i })})
            returning seq`;
        inserted.push(Number(row.seq));
    }

    // Pull from cursor 0 (what the endpoint does).
    const page = await sql`
        select seq, event_type, tag, payload
        from developer_stream_deliveries
        where app_id = ${appId} and seq > 0
        order by seq asc limit 50`;

    check("pull returns all three rows", page.length === 3);
    check("seq is monotonic ascending", page.every((r, i) => i === 0 || Number(r.seq) > Number(page[i - 1].seq)));
    check("jsonb payload round-trips", page[0]?.payload?.ticker === "PARTY" && page[0]?.payload?.i === 0);
    check("tag stored per row", page.map((r) => r.tag).join(",") === "t0,t1,t2");

    // Cursor resume: since = first seq → only the last two.
    const rest = await sql`
        select seq from developer_stream_deliveries
        where app_id = ${appId} and seq > ${inserted[0]}
        order by seq asc limit 50`;
    check("since-cursor skips already-seen rows", rest.length === 2);

    const cursor = page.length ? Number(page[page.length - 1].seq) : 0;
    check("cursor equals last seq", cursor === inserted[2]);
} catch (err) {
    console.error("  ✗ threw:", err.message, err.cause ?? "");
    failures++;
} finally {
    // Always clean up the synthetic rows.
    try { await sql`delete from developer_stream_deliveries where app_id = ${appId}`; } catch {}
    await sql.end();
}

console.log(failures ? `FAILED (${failures})` : "OK — stream delivery path verified");
process.exit(failures ? 1 : 0);
