/**
 * Grant (or revoke) the `admin` role — the key to admin.watchparty.xyz.
 *
 * ## Why this is a script you run, and not something the panel does
 *
 * `role = 'admin'` is the single credential behind `adminProcedure`, which can
 * suspend users, change roles and remove posts. Escalating it is a privileged
 * production write, so it stays an explicit, deliberate act with a named target
 * — not a side effect of building the UI.
 *
 * As of 2026-08-11 NOBODY holds it (0 of 31 users), so the panel is currently
 * unreachable by everyone, including its intended owner. That is the safe
 * direction to fail, but it does mean this must be run once before
 * admin.watchparty.xyz is usable at all.
 *
 *   node scripts/db/grant-admin.mjs --list
 *   node scripts/db/grant-admin.mjs --user bryan
 *   node scripts/db/grant-admin.mjs --user bryan --revoke
 *
 * Targets whatever DATABASE_URL is in `.env` (production). `.env.local` is
 * deliberately NOT loaded — the override trap that sent a dev-targeted drizzle
 * push at production on 2026-08-07 (CLAUDE.md) cuts the other way here: you
 * want this to hit the database the panel actually reads.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
}

const argv = process.argv;
const arg = (n) => (argv.indexOf(`--${n}`) === -1 ? null : argv[argv.indexOf(`--${n}`) + 1]);
const list = argv.includes("--list");
const revoke = argv.includes("--revoke");
const username = arg("user");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing from .env");
const sql = postgres(url, { max: 1, prepare: false });
console.log(`db: ${new URL(url).host}`);

const admins = await sql`SELECT username, role FROM "user" WHERE role = 'admin' ORDER BY username`;
console.log(`current admin(s): ${admins.length ? admins.map((a) => "@" + a.username).join(", ") : "(none)"}`);

if (list || !username) {
    if (!username && !list) console.log("\nnothing to do — pass --user <username> (or --list)");
    await sql.end();
    process.exit(0);
}

// Confirm the target EXISTS before writing. An UPDATE matching zero rows
// reports success and grants nothing, which looks identical to it having
// worked right up until the login fails.
const [target] = await sql`SELECT id, username, role FROM "user" WHERE lower(username) = lower(${username}) LIMIT 1`;
if (!target) {
    console.error(`\nno user @${username} — nothing changed.`);
    await sql.end();
    process.exit(1);
}

const next = revoke ? "user" : "admin";
if (target.role === next) {
    console.log(`\n@${target.username} is already role='${next}' — nothing to do.`);
    await sql.end();
    process.exit(0);
}

await sql`UPDATE "user" SET role = ${next} WHERE id = ${target.id}`;
console.log(`\n@${target.username}: '${target.role}' -> '${next}'`);

// Read back rather than trusting the write: this is the one credential the
// whole panel rests on.
const [after] = await sql`SELECT role FROM "user" WHERE id = ${target.id}`;
console.log(`verified: role='${after.role}'`);
if (!revoke) {
    console.log("\n⚠️ The session payload CACHES `role`, so sign out and back in");
    console.log("   before admin.watchparty.xyz will let you through.");
}

await sql.end();
