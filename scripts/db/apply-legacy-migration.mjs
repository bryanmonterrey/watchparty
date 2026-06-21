// Applies db/legacy-wallet-migration.sql to the database in DATABASE_URL.
// Run it yourself (your shell's authority):  node scripts/db/apply-legacy-migration.mjs
// One-off helper for the legacy-custodial -> Swig migration. Safe to delete after.
import fs from "node:fs";
import postgres from "postgres";

function loadEnv(file) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 0) continue;
        const k = t.slice(0, i).trim();
        if (process.env[k] === undefined) {
            process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        }
    }
}
loadEnv(".env");
loadEnv(".env.local");

const sqlText = fs.readFileSync("db/legacy-wallet-migration.sql", "utf8");
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const rowsBefore = await sql`select count(*)::int n from encrypted_wallets where frost_public_key is null`;
console.log(`legacy custodial rows before: ${rowsBefore[0].n}`);

await sql.unsafe(sqlText);

const rowsAfter = await sql`select count(*)::int n from encrypted_wallets where frost_public_key is null`;
console.log(`legacy custodial rows after:  ${rowsAfter[0].n} (expect 0)`);
console.log("✓ migration applied");
await sql.end();
