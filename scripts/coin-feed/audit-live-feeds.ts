/**
 * What is ACTUALLY ON SCREEN right now — the trending board and the alert rail
 * — graded for spam by a model and for liquidity by arithmetic.
 *
 * ## Why this is not `audit-spam.ts`
 *
 * That script audits `tracked_tokens`, which is the alert WATCH-LIST: the set
 * of coins the scanner is willing to look at. This one audits the two surfaces
 * a person opens:
 *
 *   BOARD  trending_coins, after the exact gates server/routers/trending.ts
 *          applies — liquidity floor, `clearsBrandBar`, `isRiskyHoldings`,
 *          verified allowlist.
 *   ALERTS coin_feed_events, the rows the /feed rail renders, joined back to
 *          whatever liquidity we know for the coin.
 *
 * Auditing the raw tables instead would grade rows nobody sees and report a
 * problem (or a clean bill) that has nothing to do with the complaint. The
 * point of applying the gates here is that a coin surviving them is, by
 * definition, one the filters believe is fine — so anything the model flags is
 * a MISS, not a known reject.
 *
 *   bun scripts/coin-feed/audit-live-feeds.ts --db prod
 *   bun scripts/coin-feed/audit-live-feeds.ts --db prod --hours 24
 *
 * SELECT-only. Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN for the model
 * (Workers AI); without them the liquidity half still runs and the spam half is
 * skipped rather than faked.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { reviewCoinSpam } from "../../lib/coin-feed/spam-review";
import { clearsBrandBar, isRiskyHoldings } from "../../lib/coin-feed/quality";

// ⚠️ WHICH DATABASE. `.env.local` overrides DATABASE_URL with the dev project,
// so loading both files points a "production audit" at an empty database and
// reports everything clean. Same convention as the sibling audits.
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
        /* absent file is fine */
    }
}

const arg = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
};
const hours = Number(arg("hours", "24"));

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const sql = postgres(url, { max: 1, prepare: false });
console.log(`db target: ${target} (${new URL(url).host})   window: ${hours}h\n`);

const usd = (n: number | null | undefined) =>
    n == null ? "—" : n >= 1_000_000 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`;

type BoardRow = {
    network: string;
    token_address: string;
    symbol: string;
    name: string | null;
    liquidity_usd: number | null;
    volume_24h_usd: number | null;
    image_url: string | null;
    top10_pct: number | null;
    dev_pct: number | null;
    snipers_pct: number | null;
    insiders_pct: number | null;
    bundlers_pct: number | null;
};

const board = await sql<BoardRow[]>`
    SELECT network, token_address, symbol, name, liquidity_usd, volume_24h_usd, image_url,
           top10_pct, dev_pct, snipers_pct, insiders_pct, bundlers_pct
    FROM trending_coins
    WHERE fetched_at >= now() - (${hours} || ' hours')::interval
    ORDER BY volume_24h_usd DESC NULLS LAST
`;

// The same two gates the board applies, in the same order. `verified` is passed
// false: the allowlist is a network call and its only effect is to ADMIT coins,
// so leaving it out can over-report suspects but never hide one.
const visible = board
    .filter((r) => clearsBrandBar(r.symbol, r.name, r.liquidity_usd, false, r.token_address))
    .filter((r) => !isRiskyHoldings({
        top10Pct: r.top10_pct,
        devPct: r.dev_pct,
        snipersPct: r.snipers_pct,
        insidersPct: r.insiders_pct,
        bundlersPct: r.bundlers_pct,
    }));

console.log(`BOARD: ${board.length} rows, ${visible.length} survive the gates (${board.length - visible.length} filtered)\n`);

// ── LIQUIDITY, which needs no model ──────────────────────────────────────────
// The complaint "some of these have 0 liquidity clearly duds" is arithmetic, and
// it is worth separating from the spam question: a real project with no
// liquidity and a scam with plenty are different problems with different fixes.
const buckets = [
    { label: "no liquidity value at all", test: (n: number | null) => n == null },
    { label: "under $1k", test: (n: number | null) => n != null && n < 1_000 },
    { label: "$1k – $10k", test: (n: number | null) => n != null && n >= 1_000 && n < 10_000 },
    { label: "$10k – $100k", test: (n: number | null) => n != null && n >= 10_000 && n < 100_000 },
    { label: "$100k+", test: (n: number | null) => n != null && n >= 100_000 },
];
console.log("liquidity of what the board SHOWS:");
for (const b of buckets) {
    const n = visible.filter((r) => b.test(r.liquidity_usd)).length;
    if (n) console.log(`  ${String(n).padStart(4)}  ${b.label}`);
}

const thin = visible.filter((r) => (r.liquidity_usd ?? 0) < 1_000);
if (thin.length) {
    console.log(`\n  worst offenders (untradeable, still on screen):`);
    for (const r of thin.slice(0, 12)) {
        console.log(`    ${r.symbol.padEnd(12)} ${usd(r.liquidity_usd).padStart(7)} liq  ${usd(r.volume_24h_usd).padStart(7)} vol  [${r.network}]`);
    }
}

const noImage = visible.filter((r) => !r.image_url);
console.log(`\n  ${noImage.length} of ${visible.length} render with NO IMAGE${noImage.length ? `: ${noImage.slice(0, 10).map((r) => r.symbol).join(", ")}` : ""}`);

// ── ALERT RAIL ───────────────────────────────────────────────────────────────
type AlertRow = {
    kind: string;
    symbol: string | null;
    name: string | null;
    network: string | null;
    token_address: string | null;
    liquidity_usd: number | null;
    n: number;
};

// The rail is DENORMALISED — symbol and address live on the event itself so it
// renders with no joins (see the schema comment). So this reads the event's own
// identity and only reaches out for a liquidity figure.
const alerts = await sql<AlertRow[]>`
    SELECT e.kind, e.symbol, e.network, e.token_address,
           t.name,
           coalesce(tr.liquidity_usd, t.liquidity_usd) AS liquidity_usd,
           count(*)::int AS n
    FROM coin_feed_events e
    LEFT JOIN tracked_tokens t ON t.id = e.tracked_token_id
    LEFT JOIN trending_coins tr
           ON tr.network = e.network AND tr.token_address = e.token_address
    WHERE e.created_at >= now() - (${hours} || ' hours')::interval
    GROUP BY e.kind, e.symbol, e.network, e.token_address, t.name, tr.liquidity_usd, t.liquidity_usd
    ORDER BY n DESC
`;

const alertCoins = new Map<string, AlertRow>();
for (const a of alerts) {
    const key = `${a.network}:${a.token_address}`;
    const cur = alertCoins.get(key);
    if (cur) cur.n += a.n;
    else alertCoins.set(key, { ...a });
}
const alertList = [...alertCoins.values()].sort((x, y) => y.n - x.n);

console.log(`\nALERTS: ${alerts.reduce((s, a) => s + a.n, 0)} events across ${alertList.length} coins`);
const alertThin = alertList.filter((a) => (a.liquidity_usd ?? 0) < 1_000);
console.log(`  ${alertThin.length} of ${alertList.length} coins firing alerts have under $1k liquidity`);
for (const a of alertList.slice(0, 12)) {
    console.log(`    ${String(a.n).padStart(4)} events  ${(a.symbol ?? "?").padEnd(12)} ${usd(a.liquidity_usd).padStart(7)} liq  [${a.network}]`);
}

// ── SPAM, which does need a model ────────────────────────────────────────────
const canReview = !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
if (!canReview) {
    console.log("\n(skipping the spam review — CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set)");
} else {
    for (const [label, candidates] of [
        ["BOARD", visible.slice(0, 80).map((r) => ({
            network: r.network, tokenAddress: r.token_address, symbol: r.symbol, name: r.name,
            liquidityUsd: r.liquidity_usd, volume24hUsd: r.volume_24h_usd, imageUrl: r.image_url,
        }))],
        ["ALERTS", alertList.slice(0, 60).map((a) => ({
            network: a.network ?? "solana", tokenAddress: a.token_address ?? "", symbol: a.symbol ?? "?",
            name: a.name, liquidityUsd: a.liquidity_usd, volume24hUsd: null as number | null,
            imageUrl: null as string | null,
        }))],
    ] as const) {
        if (!candidates.length) continue;
        console.log(`\n── model review: ${label} (${candidates.length} coins) ──`);
        const review = await reviewCoinSpam(candidates);
        if (!review) {
            console.log("  review unavailable");
            continue;
        }
        console.log(`  reviewed ${review.reviewed}, ${review.rejectedByBar} already rejected by the brand bar`);
        if (review.invisible.length) {
            console.log(`  MISSES the rules did not catch:`);
            // Defensive on the model's shape, not on ours: `reviewCoinSpam`
            // parses free-form JSON out of a chat completion, so a field can be
            // named differently or missing entirely on any given call. Crashing
            // the audit over it would throw away the run's other half.
            for (const s of review.invisible as unknown as Record<string, unknown>[]) {
                const sym = s.symbol ?? s.ticker ?? s.name ?? "?";
                const why = s.why ?? s.reason ?? JSON.stringify(s);
                console.log(`    ${String(sym).padEnd(12)} ${String(why)}`);
            }
        } else {
            console.log("  no misses flagged");
        }
        if (review.proposedTerms.length) console.log(`  proposed BRAND_TERMS: ${review.proposedTerms.join(", ")}`);
        if (review.proposedWords.length) console.log(`  proposed BRAND_WORDS: ${review.proposedWords.join(", ")}`);
    }
}

await sql.end();
