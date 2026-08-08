#!/usr/bin/env node
/**
 * Helius credit usage, straight from their Admin API.
 *
 *   bun scripts/dev/helius-usage.mjs
 *
 * Needs HELIUS_PROJECT_ID in .env alongside the existing HELIUS_API_KEY. The
 * project id is NOT a secret — it is the uuid in your dashboard URL
 * (dashboard.helius.dev/project/<this-part>), and it is useless without the key.
 *
 * Why this instead of the `helius` CLI: the CLI authenticates with its own
 * keypair at ~/.helius/keypair.json, which means a separate signup and a
 * credential this project doesn't otherwise need. The Admin API accepts the
 * ordinary RPC key via X-Api-Key — verified against the live endpoint, which
 * answers 400 "Invalid project id" (not 401) when the key is good and only the
 * id is wrong.
 *
 * Pairs with scripts/dev/rpc-usage.mjs. The two answer different questions and
 * the gap between them is the interesting part:
 *   - THIS is Helius's own total, covering every caller including the ones that
 *     never touch /api/rpc (token-sync's bonding-curve reads, the wallet
 *     router, mint-prices).
 *   - rpc-usage.mjs is the per-method breakdown for browser traffic only.
 * If this total is far larger than that one, the difference is server-side
 * callers, and that is where to look next.
 */

import { readFileSync } from "node:fs";

const ADMIN_API = "https://admin-api.helius.xyz/v0";

function env(key) {
    for (const f of [".env.production", ".env.local", ".env"]) {
        try {
            const line = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
            if (line) return line.slice(key.length + 1).replace(/^["']|["']$/g, "").trim();
        } catch { /* not present */ }
    }
    return null;
}

const apiKey = env("HELIUS_API_KEY");
const projectId = process.argv[2] ?? env("HELIUS_PROJECT_ID");

if (!apiKey) {
    console.error("no HELIUS_API_KEY in .env*");
    process.exit(1);
}
if (!projectId) {
    console.error(`
  no HELIUS_PROJECT_ID set.

  Find it in the dashboard URL:  dashboard.helius.dev/project/<PROJECT_ID>
  It is not a secret (it does nothing without the API key), so it can go in
  .env directly:

      echo "HELIUS_PROJECT_ID=<id>" >> .env

  or pass it once:  bun scripts/dev/helius-usage.mjs <id>
`);
    process.exit(1);
}

const res = await fetch(`${ADMIN_API}/admin/projects/${encodeURIComponent(projectId)}/usage`, {
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
});

if (!res.ok) {
    const body = await res.text();
    console.error(`\n  Helius admin API ${res.status}: ${body.slice(0, 200)}\n`);
    // 400 means the KEY was accepted and only the id is wrong — worth saying,
    // because it is the difference between "wrong id" and "rotate your key".
    if (res.status === 400) console.error("  (the key authenticated — check the project id)\n");
    process.exit(1);
}

const u = await res.json();
const sub = u.subscriptionDetails ?? {};
// The LIVE response disagrees with the SDK's own TypeScript types: it returns
// `creditCycle` and `credits`, while the types declare `billingCycle` and
// `usage`. On the free plan `subscriptionDetails.billingCycle` is null
// outright. Both shapes are read so this keeps working whichever one a given
// plan returns — and so a silent {} doesn't masquerade as "no usage".
const cycle = u.creditCycle ?? sub.billingCycle ?? {};
const used = u.creditsUsed ?? 0;
const limit = sub.creditsLimit ?? 0;
const pct = limit > 0 ? (used / limit) * 100 : 0;

console.log(`\n  plan: ${sub.plan ?? "?"}   cycle: ${(cycle.start ?? "?").slice(0, 10)} → ${(cycle.end ?? "?").slice(0, 10)}`);
console.log(`  used ${used.toLocaleString()} of ${limit.toLocaleString()} credits  (${pct.toFixed(1)}%)`);
console.log(`  remaining: ${(u.creditsRemaining ?? 0).toLocaleString()}`);
if (u.prepaidCreditsRemaining) {
    console.log(`  prepaid remaining: ${u.prepaidCreditsRemaining.toLocaleString()}`);
}

// Days left in the cycle, so "am I going to run out" is answerable rather than
// inferred. This is the number that actually decides plan vs. optimisation.
if (cycle.start && cycle.end) {
    const start = new Date(cycle.start).getTime();
    const end = new Date(cycle.end).getTime();
    const now = Date.now();
    const elapsedDays = Math.max((now - start) / 86_400_000, 0.01);
    const totalDays = (end - start) / 86_400_000;
    const perDay = used / elapsedDays;
    const projected = perDay * totalDays;
    console.log(`\n  burn: ${Math.round(perDay).toLocaleString()}/day → ~${Math.round(projected).toLocaleString()} projected this cycle`);
    if (limit > 0) {
        console.log(
            projected > limit
                ? `  ⚠ on track to EXCEED the limit by ~${Math.round(projected - limit).toLocaleString()}`
                : `  on track to finish under the limit (~${Math.round(limit - projected).toLocaleString()} spare)`,
        );
    }
}

const breakdown = Object.entries(u.credits ?? u.usage ?? {})
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

if (breakdown.length) {
    console.log("\n  by product:");
    for (const [k, v] of breakdown) {
        const share = used > 0 ? ((Number(v) / used) * 100).toFixed(1) : "0.0";
        console.log(`    ${k.padEnd(12)}${Number(v).toLocaleString().padStart(12)}  ${share}%`);
    }
}
console.log();
