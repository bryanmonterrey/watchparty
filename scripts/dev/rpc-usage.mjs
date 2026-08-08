#!/usr/bin/env node
/**
 * What is actually burning the Helius quota.
 *
 *   bun scripts/dev/rpc-usage.mjs              # today
 *   bun scripts/dev/rpc-usage.mjs 2026-08-07   # a specific day
 *   bun scripts/dev/rpc-usage.mjs --week       # last 8 days, totals only
 *
 * Reads the counters /api/rpc writes. Deliberately a SCRIPT and not an HTTP
 * endpoint: the numbers are only needed occasionally by someone who already has
 * the Upstash credentials, and adding a public route would mean adding an auth
 * gate to protect data that isn't worth the surface.
 *
 * The column that matters is BILLED — requests that actually reached Helius.
 * The proxy caches, so total traffic is the wrong number: a method with 100k
 * hits and 200 misses costs almost nothing.
 */

import { readFileSync } from "node:fs";

function env(key) {
    for (const f of [".env.production", ".env.local", ".env"]) {
        try {
            const line = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
            if (line) return line.slice(key.length + 1).replace(/^["']|["']$/g, "").trim();
        } catch { /* not present */ }
    }
    return null;
}

const url = env("UPSTASH_REDIS_REST_URL") ?? env("KV_REST_API_URL");
const token = env("UPSTASH_REDIS_REST_TOKEN") ?? env("KV_REST_API_TOKEN");
if (!url || !token) {
    console.error("no Upstash REST credentials in .env* (UPSTASH_REDIS_REST_URL/TOKEN)");
    process.exit(1);
}

async function hgetall(key) {
    const res = await fetch(`${url}/hgetall/${encodeURIComponent(key)}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    const { result } = await res.json();
    if (!Array.isArray(result)) return {};
    // Upstash returns a flat [field, value, field, value, …] array.
    const out = {};
    for (let i = 0; i < result.length; i += 2) out[result[i]] = Number(result[i + 1]) || 0;
    return out;
}

function parse(raw) {
    const byMethod = new Map();
    for (const [field, value] of Object.entries(raw)) {
        const idx = field.lastIndexOf(":");
        if (idx < 1) continue;
        const method = field.slice(0, idx);
        const bucket = field.slice(idx + 1);
        const row = byMethod.get(method) ?? { method, billed: 0, hit: 0, miss: 0, bypass: 0, skip: 0, error: 0 };
        if (bucket in row) row[bucket] = value;
        byMethod.set(method, row);
    }
    return [...byMethod.values()].sort((a, b) => b.billed - a.billed);
}

const args = process.argv.slice(2);

if (args.includes("--week")) {
    console.log("\n  day          billed    cached   hit-rate");
    console.log("  ─────────────────────────────────────────");
    for (let i = 0; i < 8; i++) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        const rows = parse(await hgetall(`rpc:usage:${d}`));
        const billed = rows.reduce((n, r) => n + r.billed, 0);
        const hit = rows.reduce((n, r) => n + r.hit, 0);
        const rate = billed + hit > 0 ? `${((hit / (billed + hit)) * 100).toFixed(0)}%` : "–";
        console.log(`  ${d}  ${String(billed).padStart(7)}  ${String(hit).padStart(8)}  ${rate.padStart(8)}`);
    }
    console.log();
    process.exit(0);
}

const day = args[0] ?? new Date().toISOString().slice(0, 10);
const rows = parse(await hgetall(`rpc:usage:${day}`));

if (!rows.length) {
    console.log(`\n  no counters for ${day} — either no traffic, or the instrumented proxy isn't deployed yet.\n`);
    process.exit(0);
}

const billed = rows.reduce((n, r) => n + r.billed, 0);
const hit = rows.reduce((n, r) => n + r.hit, 0);

console.log(`\n  ${day} — ${billed.toLocaleString()} billed upstream, ${hit.toLocaleString()} served from cache`);
if (billed + hit > 0) {
    console.log(`  cache hit rate: ${((hit / (billed + hit)) * 100).toFixed(1)}%`);
}
// Projected against a 30-day month, so the number can be compared to a plan
// limit without doing arithmetic in your head.
console.log(`  at this rate: ~${(billed * 30).toLocaleString()}/month\n`);

console.log("  method                          billed     cached    errors   % of billed");
console.log("  ──────────────────────────────────────────────────────────────────────────");
for (const r of rows.slice(0, 20)) {
    const pct = billed > 0 ? ((r.billed / billed) * 100).toFixed(1) : "0.0";
    console.log(
        `  ${r.method.padEnd(30)}${String(r.billed).padStart(7)}${String(r.hit).padStart(11)}${String(r.error).padStart(10)}${(pct + "%").padStart(13)}`,
    );
}
console.log();
