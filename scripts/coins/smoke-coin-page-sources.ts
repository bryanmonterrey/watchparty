/**
 * Every data source the coin page reads, called for real.
 *
 * tsc cannot see any of what this checks. The failure it exists for is a
 * provider mapping that compiles perfectly and returns nothing — a renamed
 * field, a parameter the endpoint spells differently (`asset` vs `address`,
 * which 400s), a chain slug the upstream doesn't know. Each of those renders as
 * an empty card, which looks exactly like a quiet coin.
 *
 *   bun scripts/coins/smoke-coin-page-sources.ts
 *
 * Reads MOBULA_API_KEY from the environment (fall back: .env.production).
 * Mobula's free plan allows ONE REQUEST PER SECOND, so the calls are spaced —
 * a 429 here is the limiter, not a broken source, and is reported as such.
 */
import fs from "node:fs";
import path from "node:path";

import {
    fetchMobulaTokenHolders,
    fetchMobulaTokenTrades,
    fetchMobulaTokenSecurity,
    fetchMobulaCandles,
    mobulaEnabled,
} from "../../lib/coins/mobula";

if (!process.env.MOBULA_API_KEY) {
    for (const file of [".env.local", ".env.production"]) {
        const p = path.join(process.cwd(), file);
        if (!fs.existsSync(p)) continue;
        const m = fs.readFileSync(p, "utf8").match(/^MOBULA_API_KEY=(.*)$/m);
        if (m) {
            process.env.MOBULA_API_KEY = m[1].replace(/["']/g, "").trim();
            break;
        }
    }
}

if (!mobulaEnabled()) {
    console.error("MOBULA_API_KEY is not set — nothing to smoke.");
    process.exit(1);
}

// One Solana coin and one EVM coin. The EVM case is the one that regressed
// silently for a year: holders came from Helius DAS, which has no notion of an
// ERC-20, so the card was empty on every chain except Solana.
const CASES = [
    { chain: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK" },
    { chain: "base", address: "0x532f27101965dd16442E59d40670FaF5eBB142E4", symbol: "BRETT" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
    if (!ok) failures++;
    console.log(`  ${ok ? "OK  " : "FAIL"} ${label.padEnd(14)} ${detail}`);
};

for (const c of CASES) {
    console.log(`\n${c.symbol} / ${c.chain}`);

    // TRADES — the table under the chart, and (since the chart came off Helius)
    // the thing that advances the candle. `priceUsd` is the field that makes
    // that possible; without it every row is dropped by the persister and the
    // chart silently stops ticking.
    const trades = await fetchMobulaTokenTrades(c.chain, c.address, 100).catch((e) => {
        check("trades", false, String(e));
        return null;
    });
    if (trades) {
        const priced = trades.filter((t) => t.priceUsd && t.priceUsd > 0).length;
        check("trades", trades.length > 0, `${trades.length} rows`);
        check("trades.price", priced > 0, `${priced}/${trades.length} carry priceUsd`);
    }
    await sleep(1500);

    // HOLDERS — was Helius DAS, Solana-only, truncated at 1,000 token accounts.
    const holders = await fetchMobulaTokenHolders(c.chain, c.address, 20).catch((e) => {
        check("holders", false, String(e));
        return null;
    });
    if (holders) {
        const shares = holders.filter((h) => h.sharePercent > 0).length;
        check("holders", holders.length > 0, `${holders.length} rows`);
        // A zero share on every row means the supply side of the upstream
        // calculation is missing — the table renders, every number is 0%.
        check("holders.share", shares > 0, `${shares}/${holders.length} have a supply share`);
    }
    await sleep(1500);

    // SECURITY — the card beside the activity card.
    const sec = await fetchMobulaTokenSecurity(c.chain, c.address).catch((e) => {
        check("security", false, String(e));
        return null;
    });
    check("security", !!sec, sec ? `holders=${sec.holdersCount} top10=${sec.top10Pct}` : "null");
    await sleep(1500);

    // CANDLES — chart history. The live bar comes from the trades above, but
    // the first paint is this.
    const now = Math.floor(Date.now() / 1000);
    const bars = await fetchMobulaCandles(c.address, c.chain, "60", now - 86_400, now, 24).catch((e) => {
        check("candles", false, String(e));
        return null;
    });
    check("candles", !!bars && bars.length > 0, bars ? `${bars.length} bars` : "null");
    await sleep(1500);
}

console.log(failures === 0 ? "\nAll coin-page sources answered." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
