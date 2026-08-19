#!/usr/bin/env bun
/**
 * Report where the dev database has fallen behind the drizzle schema.
 *
 *   bun scripts/db/check-drift.ts          # dev (default)
 *   bun scripts/db/check-drift.ts prod     # production, read-only
 *
 * ## Why this exists
 *
 * On 2026-08-11 `user.is_bot` was present in the schema and in production but
 * missing from the dev database, so EVERY full-row select on `user` threw
 * locally — `/api/create-wallet` among them. Nothing announced it: the schema
 * compiled, tests passed, production was fine, and the failure surfaced only as
 * drizzle's opaque "Failed query" with the real reason on `.cause`.
 *
 * That happens because schema changes ship as hand-written SQL under `db/` and
 * have to be applied to BOTH projects (see CLAUDE.md). Applying to production
 * and forgetting dev leaves no trace until something reads the column.
 *
 * ## What it does NOT do
 *
 * It does not write, and it does not run `drizzle-kit push` — that clobbered
 * production once already (memory: `drizzle-config-override-trap`). It reads
 * `information_schema` and compares. Fixes stay manual and reviewable: find the
 * matching file under `db/`, apply it to dev, commit nothing.
 *
 * It also only detects things MISSING from the database. A column the database
 * has and the schema does not is not reported — that direction is usually a
 * deliberate leftover, and guessing about it would produce noise.
 *
 * ## Why it runs against PRODUCTION in CI
 *
 * On 2026-08-19 a deploy shipped code selecting `user.server_tag_id` while the
 * column existed only locally. Every gate passed — tsc, 449 tests, five guards
 * — because none of them knows the production schema, and drizzle would have
 * failed EVERY post query the moment the worker went live: feed, profiles,
 * replies, bookmarks, likes. A full content outage from a feature nobody had
 * used yet, caught by hand with minutes to spare.
 *
 * That gap is structural, not a mistake: schema ships as hand-applied SQL under
 * `db/`, so code and schema deploy independently and a committed-but-unapplied
 * migration looks exactly like an applied one. This is the only check that can
 * see the difference, which is why it gates the deploy.
 *
 * Production is allowed here because the query is a READ of
 * `information_schema` and nothing else. The refusal below still stands for the
 * default (dev) path, where the historic accident was a WRITE.
 */

import { db } from "@/db";
import { sql, getTableName, getTableColumns } from "drizzle-orm";
import * as schema from "@/db/schema";

const target = process.argv[2] === "prod" ? "prod" : "dev";
const url = String(process.env.DATABASE_URL || "");
const isProdUrl = url.includes("ugpz");

// Targeting production must be DELIBERATE, in both directions: an unmarked run
// against prod is the old accident, and a `prod` run that quietly reads dev
// would report "clean" about a database nobody asked about.
if (target === "dev" && isProdUrl) {
    console.error("REFUSING: DATABASE_URL is the production project. Pass `prod` if you mean it.");
    process.exit(1);
}
if (target === "prod" && !isProdUrl) {
    console.error("REFUSING: asked for `prod` but DATABASE_URL is not the production project.");
    process.exit(1);
}

// A database we cannot REACH must not block the deploy.
//
// This gate exists to catch a schema that is genuinely behind the code. Turning
// "Supabase was briefly unreachable" into "nothing ships" would trade a rare
// outage for a frequent one, and it is the wrong trade for a safety net: the
// failure it guards against is a mistake we make, not an upstream blip.
// Detected drift is fatal; an unanswered question is loud and non-fatal.
let live: any;
try {
    live = await db.execute(
        sql.raw(`select table_name, column_name from information_schema.columns where table_schema='public'`),
    );
} catch (err) {
    console.warn(`WARNING: could not reach the ${target} database — schema NOT verified.`);
    console.warn(String((err as { cause?: unknown })?.cause ?? err).slice(0, 300));
    process.exit(0);
}
const have = new Map<string, Set<string>>();
for (const r of (live.rows ?? live) as any[]) {
    if (!have.has(r.table_name)) have.set(r.table_name, new Set());
    have.get(r.table_name)!.add(r.column_name);
}

const problems: string[] = [];
for (const value of Object.values(schema as Record<string, any>)) {
    if (!value || typeof value !== "object") continue;
    let table: string, cols: Record<string, any>;
    try {
        table = getTableName(value);
        cols = getTableColumns(value);
    } catch {
        continue;   // not a table export
    }
    if (!table || !cols) continue;

    const present = have.get(table);
    if (!present) { problems.push(`table missing:   ${table}`); continue; }

    const gone = Object.values(cols).map((c: any) => c.name).filter((n: string) => !present.has(n));
    if (gone.length) problems.push(`columns missing: ${table} → ${gone.join(", ")}`);
}

if (!problems.length) {
    console.log(`${target} database matches the schema`);
    process.exit(0);
}
console.log(`${problems.length} drift(s) — ${target} is behind the schema:\n`);
for (const p of problems) console.log("  " + p);
console.log(
    target === "prod"
        ? "\nDEPLOY BLOCKED. The code being deployed reads columns production does not have,\n" +
          "which fails the query at runtime rather than at build. Apply the matching file:\n" +
          "  node scripts/db/apply-sql.mjs db/<file>.sql prod\n"
        : "\nFind the matching file under db/ and apply it to dev. Do not push.",
);
process.exit(1);
