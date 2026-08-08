#!/usr/bin/env node
/**
 * End-to-end smoke test for "ask watchparty" against the REAL model.
 *
 * Exists because the assistant shipped eight times on green tsc and green CI
 * while producing empty messages in the browser. Nothing in the type system or
 * the build can see that: the failure was `maxOutputTokens` set below what a
 * REASONING model spends before it emits a single content token.
 *
 * This asserts the one thing that actually matters — that visible text comes
 * back — plus the properties around it. It talks to Cloudflare Workers AI
 * directly (no auth, no DB, no deploy), so it runs in seconds and can gate a
 * change before it reaches prod.
 *
 *   bun scripts/ai/smoke-assistant.mjs
 */

import { readFileSync } from "node:fs";

// Read creds the way the route does, falling through the env files.
function env(key) {
    for (const f of [".env.production", ".env.local", ".env"]) {
        try {
            const line = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
            if (line) {
                const v = line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
                if (v) return v;
            }
        } catch { /* file absent */ }
    }
    return process.env[key];
}

const ACCOUNT = env("CLOUDFLARE_ACCOUNT_ID");
const TOKEN = env("CLOUDFLARE_API_TOKEN");
const MODEL = env("ASSISTANT_MODEL") ?? env("PREDICTIONS_FACTORY_MODEL") ?? "@cf/zai-org/glm-5.2";

// Must track app/api/assistant/route.ts. If that changes and this doesn't, the
// smoke test stops describing the thing it's meant to protect.
const MAX_OUTPUT_TOKENS = 6000;

if (!ACCOUNT || !TOKEN) {
    console.error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not found in .env*");
    process.exit(1);
}

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { console.log(`  \x1b[31m✗\x1b[0m ${m}`); failures++; };
let failures = 0;

console.log(`\nmodel: ${MODEL}   maxOutputTokens: ${MAX_OUTPUT_TOKENS}\n`);

async function stream(messages, tools) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({
            model: MODEL,
            messages,
            stream: true,
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0.6,
            ...(tools ? { tools } : {}),
        }),
        signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", content = "", reasoningDeltas = 0, contentDeltas = 0;
    const toolCalls = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const p = line.slice(5).trim();
            if (p === "[DONE]") continue;
            let d; try { d = JSON.parse(p); } catch { continue; }
            const delta = d.choices?.[0]?.delta ?? {};
            if (delta.reasoning_content) reasoningDeltas++;
            if (delta.content) { contentDeltas++; content += delta.content; }
            for (const tc of delta.tool_calls ?? []) if (tc.function?.name) toolCalls.push(tc.function.name);
        }
    }
    return { content, reasoningDeltas, contentDeltas, toolCalls };
}

const SYSTEM = "You are the in-app assistant for watchparty, a live-streaming and social app built on Solana. Answer briefly, in lowercase.";

// ── 1. THE REGRESSION THAT SHIPPED ───────────────────────────────────────────
console.log("1. a plain question returns VISIBLE TEXT");
try {
    const r = await stream([
        { role: "system", content: SYSTEM },
        { role: "user", content: "what is watchparty in one sentence?" },
    ]);
    console.log(`   \x1b[2mreasoning deltas ${r.reasoningDeltas}, content deltas ${r.contentDeltas}\x1b[0m`);
    r.content.trim().length > 0
        ? ok(`got ${r.content.trim().length} chars: "${r.content.trim().slice(0, 70)}…"`)
        : bad("EMPTY content — this is the bug that shipped. Raise maxOutputTokens.");
    r.reasoningDeltas > 0
        ? ok(`model is reasoning (${r.reasoningDeltas} deltas) — budget must cover thinking AND answer`)
        : ok("no reasoning deltas (model may have changed — budget can be lower)");
} catch (e) { bad(`request failed: ${e.message}`); }

// ── 2. TOOL CALLING still works alongside reasoning ──────────────────────────
console.log("\n2. tool calling works with this model");
try {
    const r = await stream(
        [{ role: "system", content: SYSTEM }, { role: "user", content: "what coins are hot right now?" }],
        [{
            type: "function",
            function: {
                name: "getHotCoins",
                description: "Live watchparty coins that are up over the last 24h.",
                parameters: { type: "object", properties: { limit: { type: "number" } } },
            },
        }],
    );
    r.toolCalls.includes("getHotCoins")
        ? ok(`model called getHotCoins`)
        : bad(`no tool call (saw: ${r.toolCalls.join(", ") || "none"}) — grounding would silently not work`);
} catch (e) { bad(`request failed: ${e.message}`); }

// ── 3. The budget has real headroom, not just barely enough ──────────────────
console.log("\n3. a longer answer still lands inside the budget");
try {
    const r = await stream([
        { role: "system", content: SYSTEM },
        { role: "user", content: "explain how creator subscriptions and platform premium differ. two short paragraphs." },
    ]);
    console.log(`   \x1b[2mreasoning deltas ${r.reasoningDeltas}, content deltas ${r.contentDeltas}\x1b[0m`);
    r.content.trim().length > 80
        ? ok(`${r.content.trim().length} chars — budget holds for a real answer`)
        : bad(`only ${r.content.trim().length} chars — budget too tight for normal questions`);
} catch (e) { bad(`request failed: ${e.message}`); }

console.log(failures === 0 ? "\n\x1b[32mall assistant smoke checks passed\x1b[0m\n"
                           : `\n\x1b[31m${failures} check(s) failed\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
