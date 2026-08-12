#!/usr/bin/env node
/**
 * End-to-end smoke for the console Agent route (/api/console-agent) against a
 * REAL server + REAL model + REAL DB. tsc cannot see the failures that matter
 * here: an NDJSON protocol drift the console silently renders as nothing, a
 * reasoning budget eaten before any text lands, tools that never fire, or a
 * turn that streams fine but never persists (dead conversation rail).
 *
 *   bun scripts/dev/smoke-console-agent.mjs                       # local next start (:3001)
 *   BASE_URL=https://watchparty.xyz bun scripts/dev/smoke-console-agent.mjs --production
 *
 * Asserts: NDJSON events parse; the read tool fires for a "what do I have"
 * question; visible text arrives; done carries the threadId; the thread lands
 * in assistant_threads with surface='console' (and is cleaned up after).
 * Deliberately does NOT exercise a write tool: the model deciding to create
 * real rows on an arbitrary account isn't something a smoke should coax — the
 * write path is the same tRPC procedures the console UI already smokes.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const PROD = process.argv.includes("--production");
const BASE = process.env.BASE_URL ?? "http://localhost:3001";

function readEnv(file) {
    const out = {};
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
            if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
        }
    } catch { /* absent */ }
    return out;
}
const env = PROD ? readEnv(".env") : { ...readEnv(".env"), ...readEnv(".env.local") };
for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;

const { db } = await import("../../db/index.ts");
const { assistantThreads } = await import("../../db/schema/content/index.ts");
const { and, eq } = await import("drizzle-orm");

const minted = execFileSync(
    "bun",
    ["scripts/dev/mint-test-session.mjs", "--raw", ...(PROD ? ["--yes-production"] : [])],
    { encoding: "utf8" },
).trim();
// Both cookie names — the server picks the one its NODE_ENV wants (see
// smoke-oauth-flow.mjs for the full story).
const cookieValue = minted.replace(/^[^=]+=/, "");
const cookie = `better-auth.session_token=${cookieValue}; __Secure-better-auth.session_token=${cookieValue}`;

let failures = 0;
const ok = (cond, label, detail = "") => {
    if (cond) console.log(`  ✓ ${label}`);
    else {
        failures++;
        console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    }
};

const threadId = webcrypto.randomUUID();

try {
    console.log(`\nConsole Agent smoke against ${BASE}\n`);

    const res = await fetch(`${BASE}/api/console-agent`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: BASE },
        body: JSON.stringify({
            threadId,
            messages: [{ role: "user", content: "What do I have set up so far? Check my actual state." }],
        }),
    });
    ok(res.status === 200, "route answers 200", `status ${res.status}: ${await (res.status !== 200 ? res.text() : "")}`);

    let text = "";
    const events = [];
    if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.trim()) continue;
                try { events.push(JSON.parse(line)); } catch { failures++; console.error(`  ✗ non-JSON line in stream: ${line.slice(0, 80)}`); }
            }
        }
        if (buffer.trim()) { try { events.push(JSON.parse(buffer)); } catch { /* trailing partial */ } }
    }
    for (const e of events) if (e.t === "delta") text += e.v;

    ok(events.length > 0, `stream produced events (${events.length})`);
    ok(events.some((e) => e.t === "tool" && e.name === "getMyConsoleState"), "the state tool fired for a state question");
    ok(events.some((e) => e.t === "toolResult" && e.name === "getMyConsoleState"), "…and returned a result");
    ok(text.trim().length > 20, "visible text came back", `got ${text.trim().length} chars`);
    ok(events.some((e) => e.t === "done" && e.threadId === threadId), "done event carries the threadId");
    ok(!events.some((e) => e.t === "error"), "no error events");

    const [thread] = await db
        .select({ id: assistantThreads.id, surface: assistantThreads.surface, title: assistantThreads.title })
        .from(assistantThreads)
        .where(eq(assistantThreads.id, threadId))
        .limit(1);
    ok(!!thread, "thread persisted");
    ok(thread?.surface === "console", "…with surface='console'", `got ${thread?.surface}`);
} finally {
    await db.delete(assistantThreads).where(and(eq(assistantThreads.id, threadId))).catch(() => {});
}

console.log(failures === 0 ? "\nAll console-agent smoke checks passed.\n" : `\n${failures} CHECK(S) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
