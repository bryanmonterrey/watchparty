#!/usr/bin/env node
// Admin CLI for 402-gate API keys — the ops counterpart of
// server/routers/apiKeys.ts, for funding keys before self-serve purchase
// exists (and for ops against any key without going through the app).
//
//   node scripts/api/key-admin.mjs create <email> <name…>   # plaintext printed ONCE
//   node scripts/api/key-admin.mjs fund <keyId> <usd>
//   node scripts/api/key-admin.mjs revoke <keyId>
//   node scripts/api/key-admin.mjs list <email>
//
// Talks straight to the production DB (.env.production DIRECT_URL) and Upstash
// REST, and mirrors the router's invariants exactly: only a sha256 of the key
// is stored; funding folds unflushed Redis spend into the ledger BEFORE the
// balance is re-seeded so the SET can't resurrect already-spent credits.

import { readFileSync } from "node:fs";
import { createHmac, createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

function envVal(key) {
    for (const line of readFileSync(".env.production", "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i > 0 && t.slice(0, i) === key) return t.slice(i + 1).replace(/^["']|["']$/g, "");
    }
    return undefined;
}

const DB_URL = envVal("DIRECT_URL") ?? envVal("DATABASE_URL");
const REDIS_URL = envVal("UPSTASH_REDIS_REST_URL");
const REDIS_TOKEN = envVal("UPSTASH_REDIS_REST_TOKEN");
const GATE_SECRET = envVal("API_GATE_SECRET");
if (!DB_URL || !REDIS_URL || !REDIS_TOKEN) throw new Error("missing DB/Redis env in .env.production");

async function redis(...command) {
    const res = await fetch(REDIS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(command.map(String)),
    });
    const json = await res.json();
    if (json.error) throw new Error(`redis ${command[0]}: ${json.error}`);
    return json.result;
}

const sql = postgres(DB_URL, { prepare: false, max: 1 });
const [, , cmd, ...args] = process.argv;
const money = (micro) => `$${(Number(micro) / 1e6).toFixed(3)}`;

try {
    if (cmd === "create") {
        const [email, ...nameParts] = args;
        const name = nameParts.join(" ").trim();
        if (!email || !name) throw new Error("usage: create <email> <name…>");
        if (!GATE_SECRET) throw new Error("API_GATE_SECRET missing — keys cannot be signed");
        const [u] = await sql`select id from "user" where email = ${email} limit 1`;
        if (!u) throw new Error(`no user with email ${email}`);

        const id = randomBytes(8).toString("hex");
        const sig = createHmac("sha256", GATE_SECRET).update(id).digest("hex").slice(0, 32);
        const key = `wp_live_${id}.${sig}`;
        const hash = createHash("sha256").update(key).digest("hex");
        await sql`insert into api_keys (id, user_id, name, key_hash, prefix)
                  values (${id}, ${u.id}, ${name}, ${hash}, ${"wp_live_" + id.slice(0, 4) + "…"})`;
        console.log(`created key "${name}" for ${email}`);
        console.log(`  id:  ${id}`);
        console.log(`  key: ${key}`);
        console.log(`  ^ shown ONCE — only a hash is stored. Fund it with: key-admin.mjs fund ${id} <usd>`);
    } else if (cmd === "fund") {
        const [keyId, usd] = args;
        const amount = Number(usd);
        if (!keyId || !(amount > 0)) throw new Error("usage: fund <keyId> <usd>");
        const unflushed = Number((await redis("GETDEL", `apigate:spent:${keyId}`)) ?? 0);
        const micro = Math.round(amount * 1e6);
        const [row] = await sql`update api_keys
              set spent_micro = spent_micro + ${unflushed},
                  balance_micro = balance_micro - ${unflushed} + ${micro}
              where id = ${keyId} and revoked_at is null
              returning balance_micro`;
        if (!row) throw new Error(`no active key ${keyId}`);
        await redis("SET", `apigate:bal:${keyId}`, row.balance_micro);
        console.log(`funded ${keyId}: balance now ${money(row.balance_micro)} (folded ${money(unflushed)} unflushed spend)`);
    } else if (cmd === "revoke") {
        const [keyId] = args;
        if (!keyId) throw new Error("usage: revoke <keyId>");
        const [row] = await sql`update api_keys set revoked_at = now() where id = ${keyId} returning id`;
        if (!row) throw new Error(`no key ${keyId}`);
        await redis("SET", `apigate:revoked:${keyId}`, "1");
        await redis("DEL", `apigate:bal:${keyId}`);
        console.log(`revoked ${keyId} — the gate refuses it within seconds`);
    } else if (cmd === "list") {
        const [email] = args;
        if (!email) throw new Error("usage: list <email>");
        const rows = await sql`select k.id, k.name, k.prefix, k.balance_micro, k.spent_micro, k.revoked_at, k.last_used_at
              from api_keys k join "user" u on u.id = k.user_id
              where u.email = ${email} order by k.created_at desc`;
        for (const r of rows) {
            const live = await redis("GET", `apigate:bal:${r.id}`);
            console.log(
                `${r.id}  ${r.prefix}  "${r.name}"  bal=${money(live ?? r.balance_micro)}  spent=${money(r.spent_micro)}` +
                    `${r.revoked_at ? "  REVOKED" : ""}${r.last_used_at ? "" : "  never used"}`,
            );
        }
        if (!rows.length) console.log(`no keys for ${email}`);
    } else {
        console.error("usage: key-admin.mjs <create|fund|revoke|list> …");
        process.exit(1);
    }
} finally {
    await sql.end();
}
