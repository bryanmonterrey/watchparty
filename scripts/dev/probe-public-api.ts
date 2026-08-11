#!/usr/bin/env bun
/**
 * Call every PUBLIC tRPC query on a deployment, signed out, and report 5xx.
 *
 *   bun scripts/dev/probe-public-api.ts                     # production
 *   bun scripts/dev/probe-public-api.ts --base http://localhost:3001
 *
 * ## What it is looking for
 *
 * A 4xx means zod rejected the probe input. That is EXPECTED — most procedures
 * take required arguments and this sends `{}` — and it is not a defect. A 5xx
 * means the input was accepted and the handler then failed, which is either a
 * broken query or a validation error thrown with the wrong code. Both matter:
 * the second kind is indistinguishable in logs from the database being down.
 *
 * Found on the first run (2026-08-11): `user.getProfile` answered 500 to
 * "userId or username is required", because a bare `throw new Error` becomes
 * INTERNAL_SERVER_ERROR. The companion walk-pagination --prod run found
 * `comment.getComments` returning a hard 500 to every signed-out caller.
 * Neither was reported by anyone; both needed production to show up.
 *
 * ## Why signed out
 *
 * It needs no session, so it creates nothing and can run against production
 * safely. Signed-out is also the state most likely to be under-tested — the
 * comments 500 existed precisely because nobody exercised the anonymous path.
 *
 * Requests carry same-origin headers because /api/trpc answers 402 to external
 * callers by design (lib/api-pricing.ts). This is the app's own API.
 */

import { readdirSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const BASE = args.includes("--base") ? args[args.indexOf("--base") + 1] : "https://watchparty.xyz";

/** Router file → mounted key in server/routers/index.ts. Several merge into `content`. */
const MOUNT: Record<string, string> = Object.fromEntries(
    readFileSync("server/routers/index.ts", "utf8")
        .split("\n")
        .map((l) => l.match(/^\s{4}(\w+):\s*(?:mergeRouters\(([^)]*)\)|(\w+)Router)/))
        .filter(Boolean)
        .flatMap((m: any) => {
            const key = m[1];
            const files = m[2]
                ? m[2].split(",").map((x: string) => x.trim().replace(/Router$/, ""))
                : [m[3]];
            return files.filter(Boolean).map((f: string) => [f, key]);
        }),
);

const procs: { file: string; name: string; needsInput: boolean }[] = [];
for (const f of readdirSync("server/routers").filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
    const src = readFileSync(`server/routers/${f}`, "utf8");
    const parts = src.split(/\n {4}(\w+):\s*(public|protected|admin|premium)\w*Procedure/);
    for (let i = 1; i < parts.length; i += 3) {
        const [name, kind, body] = [parts[i], parts[i + 1], (parts[i + 2] || "").slice(0, 2500)];
        if (kind !== "public" || !/\.query\(/.test(body)) continue;   // queries only, never mutations
        procs.push({ file: f.replace(".ts", ""), name, needsInput: /\.input\(/.test(body) });
    }
}

const headers = { origin: BASE, referer: `${BASE}/home` };
const failures: string[] = [];
let ok = 0, rejected = 0, unmapped = 0;

for (const p of procs) {
    const mount = MOUNT[p.file];
    if (!mount) { unmapped++; continue; }
    const path = `${mount}.${p.name}`;
    const url = `${BASE}/api/trpc/${path}` +
        (p.needsInput ? `?input=${encodeURIComponent(JSON.stringify({ json: {} }))}` : "");
    try {
        const res = await fetch(url, { headers });
        const body: any = await res.json().catch(() => null);
        if (res.status >= 500) {
            failures.push(`${path} → ${res.status} ${String(body?.error?.json?.message ?? "").slice(0, 110)}`);
        } else if (res.status === 200) ok++;
        else rejected++;
    } catch (e: any) {
        failures.push(`${path} → request failed: ${String(e.message).slice(0, 70)}`);
    }
}

console.log(`${BASE}`);
console.log(`probed ${procs.length - unmapped} public queries — ${ok} answered 200, ${rejected} rejected the probe input (expected), ${failures.length} returned 5xx`);
if (unmapped) console.log(`(${unmapped} skipped: router file not mounted in index.ts)`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
