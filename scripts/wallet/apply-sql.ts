/**
 * Applies a hand-written SQL file through the app's own Postgres connection.
 *
 * The Supabase MCP is read-only and drizzle-kit push is banned on this project
 * (it can clobber the ported auth tables), so DDL gets applied here. Files are
 * expected to be idempotent — CREATE TABLE IF NOT EXISTS, DROP/CREATE POLICY —
 * so re-running is safe.
 *
 *   bun run scripts/wallet/apply-sql.ts db/linked-wallets.sql
 *
 * Replaces apply-wallet-addresses-sql.ts, which hardcoded both the file and the
 * table it verified — so it reported success for a table the file never
 * created. Verification here reads the CREATE TABLE statements out of the file
 * itself.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const file = process.argv[2];
if (!file) throw new Error("usage: bun run scripts/wallet/apply-sql.ts <path/to.sql>");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const sqlText = readFileSync(join(process.cwd(), file), "utf-8");

// Whatever this file claims to create is what we verify afterwards.
const expected = [...sqlText.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)].map((m) => m[1]);

const sql = postgres(connectionString, { max: 1, prepare: false });

try {
  await sql.unsafe(sqlText);

  if (expected.length === 0) {
    console.log(`✓ applied ${file} (no CREATE TABLE to verify)`);
  } else {
    for (const table of expected) {
      const [{ count }] = await sql`
        SELECT count(*)::int AS count
        FROM information_schema.tables
        WHERE table_name = ${table}
      `;
      console.log(count > 0 ? `✓ ${table} ready` : `✗ ${table} missing after apply`);
      if (count === 0) process.exit(1);
    }
  }
  process.exit(0);
} catch (err: any) {
  console.error("✗ failed:", err?.message ?? err);
  process.exit(1);
} finally {
  await sql.end();
}
