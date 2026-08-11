/**
 * Ask a model what the spam rules MISSED, on coins detected recently.
 *
 * ## Why this exists
 *
 * `lib/coin-feed/quality.ts` is a good filter and an entirely deterministic
 * one: a fixed brand list, a liquidity bar, and Mobula's security flags. Its
 * blind spot is structural — it can only catch the spam patterns somebody has
 * already written down.
 *
 * Twice now the writing-down happened late, and both times by hand:
 *
 *   2026-08-07  $CLAUDE / $ANTHROPIC reached the alert rail    -> BRAND_TERMS
 *   2026-08-10  HOOD + NVDA held 49 of 300 watch-list slots    -> BRAND_WORDS
 *               (16%, and HOOD at $136k liquidity would have
 *                been rejected outright had the gate known
 *                what it was looking at)
 *
 * The comment in quality.ts says "extend as observed". This script is the
 * observing — it reads the coins the rules ACCEPTED and asks what a reader
 * would have flagged.
 *
 * ## It reviews the PASSES, not the rejects
 *
 * Reviewing what the gate already caught measures the gate. The value is
 * entirely in the coins that walked through it, because that is where the next
 * HOOD is sitting right now.
 *
 * ## The model PROPOSES. It never disposes.
 *
 * Output is a list of suspects and suggested `BRAND_TERMS` / `BRAND_WORDS`
 * additions for a human to promote. Nothing here gates, hides, or deletes a
 * coin, and this script only ever SELECTs.
 *
 * That split is deliberate rather than timid. This feeds a money surface, where
 * a rule has to be auditable ("HOOD is Robinhood's ticker") and reproducible on
 * the same input. A model's verdict is neither, and `securityScore` is the
 * standing reminder of what an unexamined signal does here: it read 0 for
 * healthy coins and rejected 20 of 20 audited tokens.
 *
 *   bun scripts/coin-feed/audit-spam.ts --db prod
 *   bun scripts/coin-feed/audit-spam.ts --db prod --hours 24 --limit 120
 *
 * Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (Workers AI, free tier).
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { reviewCoinSpam } from "../../lib/coin-feed/spam-review";

// ⚠️ WHICH DATABASE — same convention as audit-security.ts, and for the same
// reason: `.env.local` overrides DATABASE_URL with the dev project, so loading
// both files silently points a "production audit" at an empty database and
// reports a clean bill of health.
//   --db dev   (default)  .env then .env.local
//   --db prod             .env only
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

const arg = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
};
const hours = Number(arg("hours", "1"));
const limit = Number(arg("limit", "80"));

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing");

const sql = postgres(url, { max: 1, prepare: false });
console.log(`db target: ${target} (${new URL(url).host})`);

type Row = {
    network: string;
    token_address: string;
    symbol: string;
    name: string | null;
    liquidity_usd: number | null;
    volume_24h_usd: number | null;
    image_url: string | null;
    first_seen_at: Date | null;
};

const rows = await sql<Row[]>`
    SELECT network, token_address, symbol, name, liquidity_usd, volume_24h_usd, image_url, first_seen_at
    FROM tracked_tokens
    WHERE first_seen_at >= now() - (${hours} || ' hours')::interval
    ORDER BY first_seen_at DESC
    LIMIT ${limit}
`;

if (!rows.length) {
    console.log(`no coins first seen in the last ${hours}h — nothing to review`);
    await sql.end();
    process.exit(0);
}

const usd = (n: number | null) => (n == null ? "?" : `$${Math.round(n).toLocaleString()}`);

// The review itself lives in lib/coin-feed/spam-review.ts, shared with the
// admin panel (admin.watchparty.xyz -> /admin/coin-spam) so the CLI and the UI
// cannot drift into two different definitions of "spam".
const review = await reviewCoinSpam(
    rows.map((r) => ({
        network: r.network,
        tokenAddress: r.token_address,
        symbol: r.symbol,
        name: r.name,
        liquidityUsd: r.liquidity_usd,
        volume24hUsd: r.volume_24h_usd,
        imageUrl: r.image_url,
    })),
);
await sql.end();

if (!review) {
    // Not "nothing found" — the review did not happen. Exiting non-zero keeps
    // the two apart for anything scripting this.
    console.error("review unavailable: Workers AI unreachable or returned no usable JSON");
    process.exit(1);
}

console.log(
    `${review.total} coin(s) first seen in the last ${hours}h — ` +
    `${review.rejectedByBar} already rejected by the brand bar, ${review.reviewed} reviewed\n`,
);

const show = (s: (typeof review.invisible)[number]) => {
    console.log(`  ${s.candidate.symbol}  [${s.confidence}]  ${s.impersonates ? `impersonates ${s.impersonates}` : ""}`);
    console.log(`     ${s.reason}`);
    console.log(`     liquidity ${usd(s.candidate.liquidityUsd)} · ${s.candidate.network} · ${s.candidate.tokenAddress}`);
};

if (review.invisible.length) {
    console.log(`── ${review.invisible.length} the gate CANNOT SEE (the actual finding) ──\n`);
    review.invisible.forEach(show);
    const below = review.invisible.filter((s) => s.belowBrandBar);
    if (below.length) {
        console.log(
            `\n  ⚠️ ${below.length} of these sit BELOW the $250k brand bar ` +
            `(${below.map((s) => s.candidate.symbol).join(", ")}) —`,
        );
        console.log("     recognising the name would reject them outright, not just raise the bar.");
    }
} else {
    console.log("nothing flagged that the gate cannot already see.");
}

if (review.known.length) {
    console.log(`\n── ${review.known.length} already recognised, admitted on liquidity (working as designed) ──`);
    console.log(`   ${review.known.map((s) => s.candidate.symbol).join(", ")}`);
}

if (review.proposedTerms.length || review.proposedWords.length) {
    console.log("\nproposed additions to lib/coin-feed/quality.ts (NOT applied — review each):");
    if (review.proposedTerms.length) console.log(`  BRAND_TERMS  (substring):      ${review.proposedTerms.join(", ")}`);
    if (review.proposedWords.length) console.log(`  BRAND_WORDS  (word-boundary):  ${review.proposedWords.join(", ")}`);
    console.log("\n  ⚠️ Reject any that are ordinary words — a substring match on a common");
    console.log("     word fails real coins, which is why COIN and META are absent by choice.");
} else {
    console.log("\nno new brand terms proposed.");
}
