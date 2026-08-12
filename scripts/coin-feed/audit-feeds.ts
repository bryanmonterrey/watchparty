/**
 * Sweep EVERY coin currently visible in the feeds, have the model judge each,
 * then work out what would have blocked the ones it flagged.
 *
 * ## Why the third step is the point
 *
 * Running a model over coins tells you which are spam. It does not tell you how
 * to STOP them — a model cannot sit in the request path of a board that renders
 * hundreds of rows, and its verdicts are neither auditable nor reproducible,
 * which is the whole reason `spam-review.ts` proposes rather than gates.
 *
 * So this compares the structural fields of the flagged coins against the clean
 * ones and reports which signal actually separates them, and where. That
 * produces a THRESHOLD — deterministic, cheap, explicable — derived from the
 * model's judgement rather than from taste.
 *
 * It is the same move that fixed the board earlier: the answer was never a
 * bigger name list, it was noticing that concentration already separated them.
 *
 *   bun scripts/coin-feed/audit-feeds.ts --db prod
 *   bun scripts/coin-feed/audit-feeds.ts --db prod --limit 400
 *
 * Read-only. Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { reviewCoinSpam, type ReviewCandidate } from "../../lib/coin-feed/spam-review";
import { isRiskyHoldings } from "../../lib/coin-feed/quality";

const target = process.argv.includes("--db") ? process.argv[process.argv.indexOf("--db") + 1] : "dev";
for (const file of target === "prod" ? [".env"] : [".env", ".env.local"]) {
    try {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
            if (!m) continue;
            let v = m[2].trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
            process.env[m[1]] = v;
        }
    } catch {
        // absent file is fine
    }
}

const arg = (n: string, d: string) => {
    const i = process.argv.indexOf(`--${n}`);
    return i === -1 ? d : process.argv[i + 1];
};
const limit = Number(arg("limit", "300"));
/** The reviewer takes a catalogue in one prompt; keep each well inside context. */
const BATCH = 50;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const sql = postgres(url, { max: 1, prepare: false });
console.log(`db: ${target} (${new URL(url).host})\n`);

/** Everything a user can currently SEE, both surfaces, deduped by token. */
type Row = ReviewCandidate & {
    surface: string;
    top10Pct: number | null;
    devPct: number | null;
    snipersPct: number | null;
    bundlersPct: number | null;
    insidersPct: number | null;
    holdersCount: number | null;
};

const board = await sql<Row[]>`
    SELECT 'board' AS surface, network, token_address AS "tokenAddress", symbol, name,
           liquidity_usd AS "liquidityUsd", volume_24h_usd AS "volume24hUsd", image_url AS "imageUrl",
           top10_pct AS "top10Pct", dev_pct AS "devPct", snipers_pct AS "snipersPct",
           bundlers_pct AS "bundlersPct", insiders_pct AS "insidersPct", holders_count AS "holdersCount"
    FROM trending_coins
    WHERE fetched_at >= now() - interval '6 hours'
    ORDER BY volume_24h_usd DESC NULLS LAST
    LIMIT ${limit}
`;

const alerts = await sql<Row[]>`
    SELECT 'alerts' AS surface, network, token_address AS "tokenAddress", symbol, name,
           liquidity_usd AS "liquidityUsd", volume_24h_usd AS "volume24hUsd", image_url AS "imageUrl",
           NULL::double precision AS "top10Pct", NULL::double precision AS "devPct",
           NULL::double precision AS "snipersPct", NULL::double precision AS "bundlersPct",
           NULL::double precision AS "insidersPct", NULL::int AS "holdersCount"
    FROM tracked_tokens
    ORDER BY volume_24h_usd DESC NULLS LAST
    LIMIT ${limit}
`;

const byToken = new Map<string, Row>();
for (const r of [...board, ...alerts]) {
    const k = `${r.network}:${r.tokenAddress}`;
    // Board rows win — they carry the holder stats the analysis needs.
    if (!byToken.has(k) || r.surface === "board") byToken.set(k, r);
}
const all = [...byToken.values()];
console.log(`${board.length} board + ${alerts.length} alert rows -> ${all.length} distinct coins\n`);

// ── judge ────────────────────────────────────────────────────────────────────
const flagged = new Map<string, { reason: string; impersonates: string | null; confidence: string }>();
let reviewed = 0;
for (let i = 0; i < all.length; i += BATCH) {
    const slice = all.slice(i, i + BATCH);
    const r = await reviewCoinSpam(slice);
    if (!r) {
        console.error(`  batch ${i / BATCH + 1}: review unavailable — skipped`);
        continue;
    }
    reviewed += r.reviewed;
    for (const s of [...r.invisible, ...r.known]) {
        flagged.set(`${s.candidate.network}:${s.candidate.tokenAddress}`, {
            reason: s.reason,
            impersonates: s.impersonates,
            confidence: s.confidence,
        });
    }
    process.stdout.write(`  batch ${i / BATCH + 1}/${Math.ceil(all.length / BATCH)}: ${r.invisible.length + r.known.length} flagged\r`);
}
console.log(`\n\nmodel flagged ${flagged.size} of ${reviewed} reviewed\n`);

// ── what separates them? ─────────────────────────────────────────────────────
const isFlagged = (r: Row) => flagged.has(`${r.network}:${r.tokenAddress}`);
const withStats = all.filter((r) => r.top10Pct != null);
const spam = withStats.filter(isFlagged);
const clean = withStats.filter((r) => !isFlagged(r));

const med = (xs: number[]) => {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};
const pull = (rows: Row[], f: keyof Row) =>
    rows.map((r) => r[f]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));

console.log(`of those, ${withStats.length} carry holder stats: ${spam.length} flagged, ${clean.length} clean\n`);
if (spam.length && clean.length) {
    console.log("signal            median(spam)  median(clean)   separation");
    for (const f of ["top10Pct", "devPct", "snipersPct", "bundlersPct", "holdersCount"] as const) {
        const a = med(pull(spam, f));
        const b = med(pull(clean, f));
        const gap = Number.isFinite(a) && Number.isFinite(b) ? (a - b).toFixed(1) : "—";
        console.log(`  ${f.padEnd(16)} ${String(a.toFixed?.(1) ?? a).padStart(10)} ${String(b.toFixed?.(1) ?? b).padStart(14)} ${String(gap).padStart(12)}`);
    }

    // How much would the CURRENT gate already stop?
    const caught = spam.filter((r) => isRiskyHoldings(r)).length;
    const falsePos = clean.filter((r) => isRiskyHoldings(r)).length;
    console.log(`\nisRiskyHoldings today: catches ${caught}/${spam.length} flagged, ` +
        `and also hides ${falsePos}/${clean.length} the model called clean`);
}

console.log("\nflagged coins the board still shows:");
for (const r of all.filter(isFlagged).slice(0, 20)) {
    const f = flagged.get(`${r.network}:${r.tokenAddress}`)!;
    const hidden = r.top10Pct != null && isRiskyHoldings(r);
    console.log(
        `  ${hidden ? "[hidden]" : "[SHOWN] "} ${String(r.symbol).slice(0, 12).padEnd(12)} [${r.network}] ` +
        `top10=${r.top10Pct == null ? "-" : Math.round(r.top10Pct) + "%"} ` +
        `${f.impersonates ? `impersonates ${f.impersonates}` : f.reason.slice(0, 50)}`,
    );
}

await sql.end();
