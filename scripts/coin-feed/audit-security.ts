/**
 * Audit the alert watch list against the security gate.
 *
 * ## Why this exists
 *
 * `screenSecurity` only runs at DISCOVERY. Nothing ever re-checks a coin once it
 * is on `tracked_tokens`, and until c68d5bbb the per-pass budget counted cache
 * hits — so only the first 12 tokens of a deterministic ordering were ever
 * screened at all. Every coin currently on the list was adopted under that, which
 * means the honeypot / tax / concentration / mint-authority / freeze-authority
 * gate has effectively never been applied to the list we actually have.
 *
 * This measures how bad that is before anything deletes rows on its own.
 *
 * ## Imports the real predicate
 *
 *  `passesSecurityBar` and `fetchMobulaTokenSecurity` are imported, not
 *  reimplemented. An audit that re-states the thresholds measures the audit.
 *
 *   bun scripts/coin-feed/audit-security.ts            # 25 busiest, report only
 *   bun scripts/coin-feed/audit-security.ts --limit 300
 *
 * Read-only. It never writes or deletes; wiring the eviction is a separate,
 * deliberate step once the number is known.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { passesSecurityBar } from "../../lib/coin-feed/quality";
import { fetchMobulaTokenSecurity } from "../../lib/coins/mobula";

/**
 * ⚠️ WHICH DATABASE — read this before changing it.
 *
 * `.env.local` overrides DATABASE_URL with the separate dev project, so loading
 * both files silently points a "production audit" at an empty dev database and
 * reports a clean bill of health. That is exactly what happened on the first run
 * here (0 rows, 0 failures) and it is the same override trap that sent a
 * drizzle push at prod on 2026-08-07.
 *
 * So the target is EXPLICIT and always printed:
 *   --db dev   (default)  .env then .env.local
 *   --db prod             .env only
 *
 * This script only ever SELECTs, which is what makes pointing it at prod
 * acceptable at all.
 */
const target = process.argv.includes("--db") ? process.argv[process.argv.indexOf("--db") + 1] : "dev";
const envFiles = target === "prod" ? [".env"] : [".env", ".env.local"];

for (const file of envFiles) {
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
            if (!m) continue;
            let v = m[2].trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                v = v.slice(1, -1);
            }
            process.env[m[1]] = v;
        }
    } catch {
        // absent file is fine
    }
}

const arg = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
};
const limit = Number(arg("limit", "25"));

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
if (!process.env.MOBULA_API_KEY) throw new Error("MOBULA_API_KEY missing — the audit would pass everything");

const sql = postgres(url, { max: 1, prepare: false });
// Print the host, never the credentials. A silent connection to the wrong
// database is the failure this guards against.
console.log(`db target: ${target} (${new URL(url).host})`);

const rows = await sql<{ network: string; token_address: string; symbol: string; liquidity_usd: number | null }[]>`
    SELECT network, token_address, symbol, liquidity_usd
    FROM tracked_tokens
    WHERE wp_token_id IS NULL AND NOT pinned
    ORDER BY volume_24h_usd DESC NULLS LAST
    LIMIT ${limit}
`;

console.log(`auditing ${rows.length} tracked coin(s) against passesSecurityBar\n`);

let pass = 0;
let fail = 0;
let unknown = 0;
const failures: string[] = [];

for (const [i, r] of rows.entries()) {
    // Mobula's free key is ~1 RPS. Serial with a gap, same as the discovery pass.
    if (i > 0) await new Promise((res) => setTimeout(res, 1100));
    try {
        const sec = await fetchMobulaTokenSecurity(r.network, r.token_address);
        if (!sec) {
            unknown++;
            console.log(`  ?  ${r.symbol.padEnd(12)} ${r.network.padEnd(8)} no data`);
            continue;
        }
        if (passesSecurityBar(sec)) {
            pass++;
        } else {
            fail++;
            // Say WHICH rule failed — "rejected" alone is unactionable, and the
            // point of the audit is deciding whether the thresholds are right.
            const why = [
                sec.honeypotFlag ? "honeypot" : null,
                sec.noMintAuthority === false ? "mint-authority-live" : null,
                sec.isFreezable === true ? "freezable" : null,
                (sec.buyTaxPct ?? 0) > 10 ? `buyTax ${sec.buyTaxPct}%` : null,
                (sec.sellTaxPct ?? 0) > 10 ? `sellTax ${sec.sellTaxPct}%` : null,
                (sec.top10Pct ?? 0) >= 80 ? `top10 ${Math.round(sec.top10Pct!)}%` : null,
                (sec.snipersPct ?? 0) >= 40 ? `snipers ${Math.round(sec.snipersPct!)}%` : null,
                (sec.insidersPct ?? 0) >= 40 ? `insiders ${Math.round(sec.insidersPct!)}%` : null,
                (sec.bundlersPct ?? 0) >= 40 ? `bundlers ${Math.round(sec.bundlersPct!)}%` : null,
                (sec.devPct ?? 0) >= 30 ? `dev ${Math.round(sec.devPct!)}%` : null,
            ].filter(Boolean).join(", ");
            // securityScore is shown as CONTEXT, never as a reason — the gate
            // stopped using it once it measured 0 on healthy coins, and listing
            // it here implied a rule that no longer exists.
            failures.push(`${r.symbol} (${r.network}): ${why}  [score ${sec.securityScore}]`);
            console.log(`  ✗  ${r.symbol.padEnd(12)} ${r.network.padEnd(8)} ${why}`);
        }
    } catch (err) {
        unknown++;
        console.log(`  !  ${r.symbol.padEnd(12)} ${r.network.padEnd(8)} ${(err as Error).message}`);
    }
}

const judged = pass + fail;
console.log(
    `\npass ${pass} · fail ${fail} · no-data ${unknown}` +
    (judged ? `  →  ${((fail / judged) * 100).toFixed(1)}% of judged coins would be evicted` : ""),
);
if (failures.length) console.log(`\nfailures:\n  ${failures.join("\n  ")}`);

await sql.end();
