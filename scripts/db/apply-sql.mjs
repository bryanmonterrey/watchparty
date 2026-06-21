// Apply a .sql file to the database using DIRECT_URL (direct, non-pooled — best
// for DDL). Reads connection from .env. Usage:
//   node scripts/db/apply-sql.mjs db/some-file.sql
import fs from "node:fs";
import postgres from "postgres";

function envVal(key) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0 || t.slice(0, i).trim() !== key) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return undefined;
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/db/apply-sql.mjs <file.sql>");
  process.exit(1);
}
const conn = envVal("DIRECT_URL") || envVal("DATABASE_URL");
if (!conn) {
  console.error("No DIRECT_URL/DATABASE_URL in .env");
  process.exit(1);
}

const sql = fs.readFileSync(file, "utf8");
const client = postgres(conn, { max: 1, prepare: false });
try {
  await client.unsafe(sql);
  console.log(`Applied ${file}`);
} catch (e) {
  console.error("Failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
