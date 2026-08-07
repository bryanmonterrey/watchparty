// Applies the 2026-08-07 incident restoration to the DB in DATABASE_URL.
// See db/restore-2026-08-07-drizzle-push-incident.sql for what and why.
//   node scripts/db/apply-prod-restore.mjs
import postgres from "postgres";
import fs from "node:fs";

function envVal(key) {
    for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
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
const sql = postgres(process.env.DATABASE_URL ?? envVal("DATABASE_URL"), { max: 1, prepare: false, onnotice: () => {} });
const files = [
    "db/restore-2026-08-07-drizzle-push-incident.sql",
    "db/feed-embeddings.sql",
    "db/coin-trades.sql",
    "db/coin-trades-realtime.sql",
    "db/community-features-2.sql",
    "db/community-features-3.sql",
];
for (const f of files) {
    try {
        await sql.unsafe(fs.readFileSync(f, "utf8"));
        console.log(`ok  ${f}`);
    } catch (err) {
        console.log(`✗  ${f} — ${String(err.message ?? err).split("\n")[0].slice(0, 120)}`);
        await sql.unsafe("ROLLBACK").catch(() => {});
    }
}
const v = {};
v.tables = (await sql`SELECT to_regclass('public.post_embeddings') AS pe, to_regclass('public.coin_trades') AS ct`)[0];
v.rls = (await sql`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('twoFactor','walletAddress')`).map(r => `${r.relname}=${r.relrowsecurity}`).join(",");
v.constraints = (await sql`SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN ('uq_channel_reads_member_channel','uq_expressions_server_kind_name','uq_member_roles','uq_sounds_server_name','uq_reaction_message_member_emoji','uq_server_boosts_server_member','uq_bans_server_user','uq_prediction_outcomes','wallet_addresses_kind_check','linked_wallets_source_check','send_fee_accruals_status_check')`)[0].n;
v.policies = (await sql`SELECT count(*)::int AS n FROM pg_policies WHERE policyname IN ('wallet_address_select_own','community_message_reactions_select','community_server_boosts_select')`)[0].n;
console.log("verify (want tables non-null, rls true, constraints 11, policies 3):");
console.log(JSON.stringify(v));
await sql.end();
