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

// ── 1b. Preflight — fail ONCE with a diagnosis, not forty times ─────────────
// New Supabase projects' direct hosts (db.<ref>.supabase.co) are IPv6-ONLY;
// on an IPv4 network they don't resolve at all (getaddrinfo ENOTFOUND). The
// Session pooler string is the IPv4 path and handles DDL fine.
{
    const probe = postgres(devUrl, { max: 1, prepare: false, connect_timeout: 10 });
    try {
        await probe`select 1`;
    } catch (err) {
        console.error(`\nCannot reach the database: ${String(err.message ?? err).split("\n")[0]}`);
        console.error(`
If that says ENOTFOUND for db.<ref>.supabase.co, the project is IPv6-only on
the direct host. Use the SESSION POOLER string instead (IPv4):
  dashboard → Connect → "Session pooler" (port 5432)
  looks like: postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`);
        process.exit(1);
    } finally {
        await probe.end({ timeout: 1 }).catch(() => {});
    }
    console.log("connectivity: ok");
}

// ── 1c. Start from a clean slate ────────────────────────────────────────────
// The dev project is disposable; a partially-populated public schema makes
// drizzle-kit's diff ask interactive "renamed or new?" questions (no TTY →
// crash). Empty schema = pure CREATE plan, no prompts. The prod-ref guard
// above is what makes this safe to automate.
{
    const wipe = postgres(devUrl, { max: 1, prepare: false, onnotice: () => {} });
    await wipe.unsafe(`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO anon, authenticated, service_role, public;`);
    await wipe.end();
    console.log("public schema reset");
}

// ── 2. Schema from drizzle ──────────────────────────────────────────────────
console.log("\n→ drizzle-kit push (creates the full schema on the empty project)…");
execSync("bunx drizzle-kit push --force", {
    stdio: "inherit",
    // DRIZZLE_DB_URL is read by drizzle.config.ts BEFORE dotenv runs — plain
    // DIRECT_URL was clobbered by .env.local's override:true, which is exactly
    // how the 2026-08-07 incident pushed drift DDL to production.
    env: { ...process.env, DRIZZLE_DB_URL: devUrl, DIRECT_URL: devUrl, DATABASE_URL: devUrl },
});

// Defense in depth: prove the push landed HERE before replaying anything.
{
    const check = postgres(devUrl, { max: 1, prepare: false });
    const [{ ok }] = await check`SELECT (to_regclass('public.user') IS NOT NULL) AS ok`;
    await check.end();
    if (!ok) {
        console.error("ABORT: schema push did not reach the target database — refusing to continue.");
        process.exit(1);
    }
}

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
        // A file with an open BEGIN can leave the session in an aborted
        // transaction, which would fail every later file with "current
        // transaction is aborted" — clear it before moving on.
        await sql.unsafe("ROLLBACK").catch(() => {});
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
