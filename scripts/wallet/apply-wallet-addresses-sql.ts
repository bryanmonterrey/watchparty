/**
 * Applies db/wallet-addresses.sql through the app's own Postgres connection.
 *
 * The Supabase MCP is read-only and drizzle-kit push is banned on this project
 * (it can clobber the ported auth tables), so hand-written DDL gets applied
 * here. The SQL is additive and idempotent — CREATE TABLE IF NOT EXISTS plus
 * DROP/CREATE POLICY — so re-running is safe.
 *
 *   bun run scripts/wallet/apply-wallet-addresses-sql.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const sqlText = readFileSync(join(process.cwd(), "db/wallet-addresses.sql"), "utf-8");

const sql = postgres(connectionString, { max: 1, prepare: false });

try {
  await sql.unsafe(sqlText);
  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM information_schema.tables
    WHERE table_name = 'wallet_addresses'
  `;
  console.log(count > 0 ? "✓ wallet_addresses ready" : "✗ table missing after apply");
  process.exit(count > 0 ? 0 : 1);
} catch (err: any) {
  console.error("✗ failed:", err?.message ?? err);
  process.exit(1);
} finally {
  await sql.end();
}
