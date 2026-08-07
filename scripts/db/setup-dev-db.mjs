// One-shot dev-database bootstrap — the dev/prod split (docs/TODO.md, ops #4).
//
//   node scripts/db/setup-dev-db.mjs "<dev DIRECT connection string>"
//
// Takes the connection string of a FRESH, EMPTY Supabase project (use the
// "Direct connection" string, port 5432 — drizzle-kit needs it), then:
//   1. refuses to run if the URL smells like the production project,
//   2. `drizzle-kit push` — creates every table/policy from db/schema
//      (safe HERE precisely because the target is empty; the CLAUDE.md ban on
//      push is about the live DB's verbatim-ported auth tables),
//   3. replays db/*.sql additively, reporting per-file results (files that
//      need pg_cron / realtime / storage may fail on a fresh project — that's
//      expected and listed, not fatal),
//   4. prints the .env.local block that points LOCAL dev at the new project.
//
// Prod deploys never read .env.local (CI restores .env from the
// DOTENV_PRODUCTION secret), so this cannot leak into production.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

function envVal(key) {
    for (const file of [".env", ".env.local"]) {
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, "utf8").split("\n")) {
            const t = line.trim();
            if (!t || t.startsWith("#")) continue;
            const i = t.indexOf("=");
            if (i > 0 && t.slice(0, i).trim() === key) {
                let v = t.slice(i + 1).trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
                return v;
            }
        }
    }
    return undefined;
}

/** The Supabase project ref, from any of its URL shapes (db.<ref>.supabase.co
 *  or the pooler's postgres.<ref> user). */
function projectRef(url) {
    const host = url.match(/@([^:/]+)/)?.[1] ?? "";
    const dbHost = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
    if (dbHost) return dbHost;
    const poolerUser = url.match(/\/\/postgres\.([a-z0-9]+):/)?.[1];
    return poolerUser ?? host;
}

const devUrl = process.argv[2]?.trim();
if (!devUrl) {
    console.error('usage: node scripts/db/setup-dev-db.mjs "<dev DIRECT connection string (port 5432)>"');
    process.exit(1);
}

// ── 1. Never against prod ───────────────────────────────────────────────────
const prodRefs = new Set(
    [envVal("DATABASE_URL"), envVal("DIRECT_URL")].filter(Boolean).map(projectRef),
);
const devRef = projectRef(devUrl);
if (prodRefs.has(devRef)) {
    console.error(`REFUSING: ${devRef} is the PRODUCTION project. Pass the new dev project's string.`);
    process.exit(1);
}
console.log(`target project: ${devRef} (prod refs: ${[...prodRefs].join(", ")})`);

// ── 2. Schema from drizzle ──────────────────────────────────────────────────
console.log("\n→ drizzle-kit push (creates the full schema on the empty project)…");
execSync("bunx drizzle-kit push --force", {
    stdio: "inherit",
    env: { ...process.env, DIRECT_URL: devUrl, DATABASE_URL: devUrl },
});

// ── 3. Replay the hand-written SQL ──────────────────────────────────────────
const sql = postgres(devUrl, { max: 1, prepare: false, onnotice: () => {} });
const files = fs.readdirSync("db").filter((f) => f.endsWith(".sql") && !f.includes(".restore.")).sort();
const results = { ok: [], failed: [] };
for (const f of files) {
    try {
        await sql.unsafe(fs.readFileSync(path.join("db", f), "utf8"));
        results.ok.push(f);
    } catch (err) {
        results.failed.push(`${f} — ${String(err.message ?? err).split("\n")[0].slice(0, 100)}`);
    }
}
await sql.end();
console.log(`\napplied ${results.ok.length}/${files.length} SQL files`);
if (results.failed.length) {
    console.log("skipped/failed (often fine on a fresh project — pg_cron/realtime/storage extras):");
    for (const f of results.failed) console.log(`  ✗ ${f}`);
}

// ── 4. The .env.local block ─────────────────────────────────────────────────
console.log(`
Done. Point LOCAL dev at it by adding to .env.local:

  DATABASE_URL=${devUrl}
  DIRECT_URL=${devUrl}

For FULL isolation (storage/realtime too, not just Postgres), also copy the
dev project's keys from its dashboard into .env.local:

  NEXT_PUBLIC_SUPABASE_URL=…
  NEXT_PUBLIC_SUPABASE_ANON_KEY=…
  SUPABASE_SERVICE_ROLE_KEY=…
  SUPABASE_JWT_SECRET=…

.env.local is gitignored and never enters DOTENV_PRODUCTION — prod is untouched.
`);
