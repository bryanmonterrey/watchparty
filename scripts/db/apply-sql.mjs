#!/usr/bin/env node
// Applies a committed .sql file from db/ to ONE explicitly-named target.
//
// Exists because of the 2026-08-07 incident: a dev-targeted `drizzle-kit push`
// hit production and dropped two tables, because .env.local's `override: true`
// clobbered the injected env. The lesson encoded here is that the target must
// be chosen deliberately and PRINTED before anything runs — never inherited
// from ambient config.
//
//   node scripts/db/apply-sql.mjs db/assistant-threads.sql dev
//   node scripts/db/apply-sql.mjs db/assistant-threads.sql prod
//
// `dev` reads DIRECT_URL from .env.local, `prod` from .env.production. Both use
// the DIRECT (5432) url, not the 6543 pooler — DDL belongs on a session
// connection.

import { readFileSync } from "node:fs";
import postgres from "postgres";

const [, , sqlPath, target] = process.argv;

if (!sqlPath || !["dev", "prod"].includes(target ?? "")) {
    console.error("usage: node scripts/db/apply-sql.mjs <file.sql> <dev|prod>");
    process.exit(1);
}

const envFile = target === "dev" ? ".env.local" : ".env.production";

function readEnv(file, key) {
    let text;
    try {
        text = readFileSync(file, "utf8");
    } catch {
        return null;
    }
    const line = text.split("\n").find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).replace(/^["']|["']$/g, "").trim() : null;
}

const url = readEnv(envFile, "DIRECT_URL") ?? readEnv(envFile, "DATABASE_URL");
if (!url) {
    console.error(`no DIRECT_URL or DATABASE_URL in ${envFile}`);
    process.exit(1);
}

// Print what we're about to touch, with credentials stripped. The project ref
// is the part of the username after "postgres." and is what actually
// distinguishes the two Supabase projects.
const host = url.replace(/.*@([^/?]+).*/, "$1");
const ref = decodeURIComponent(url.replace(/.*\/\/([^:]+):.*/, "$1")).split(".")[1] ?? "?";

console.log(`  file   : ${sqlPath}`);
console.log(`  target : ${target}  (${envFile})`);
console.log(`  host   : ${host}`);
console.log(`  project: ${ref}`);

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
    // simple:true so the whole file runs as one multi-statement script.
    await sql.unsafe(readFileSync(sqlPath, "utf8"), [], { simple: true });
    console.log("  ✓ applied");
} catch (err) {
    // .cause carries the real driver message; drizzle/postgres.js surface only
    // "Failed query" without it.
    console.error("  ✗ FAILED:", err.message, err.cause ?? "");
    process.exitCode = 1;
} finally {
    await sql.end();
}
