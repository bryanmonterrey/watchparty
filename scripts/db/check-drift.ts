#!/usr/bin/env bun
/**
 * Report where the dev database has fallen behind the drizzle schema.
 *
 *   bun scripts/db/check-drift.ts
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
 */

import { db } from "@/db";
import { sql, getTableName, getTableColumns } from "drizzle-orm";
import * as schema from "@/db/schema";

const url = String(process.env.DATABASE_URL || "");
if (url.includes("ugpz")) {
    console.error("REFUSING: DATABASE_URL is the production project. This is a dev tool.");
    process.exit(1);
}

const live: any = await db.execute(
    sql.raw(`select table_name, column_name from information_schema.columns where table_schema='public'`),
);
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
    console.log("dev database matches the schema");
    process.exit(0);
}
console.log(`${problems.length} drift(s) — dev is behind the schema:\n`);
for (const p of problems) console.log("  " + p);
console.log("\nFind the matching file under db/ and apply it to dev. Do not push.");
process.exit(1);
