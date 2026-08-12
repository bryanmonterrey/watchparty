/**
 * Re-derive the trader-concentration calibration against live data.
 *
 * `CONCENTRATION_SAMPLE` (server/routers/trade.ts) and `TOP5_SHARE_WASHY_PCT`
 * (lib/coin-feed/trader-concentration.ts) are ONE calibration: the sample size
 * changes the score, so changing either alone silently re-labels coins.
 *
 * It does not change it in a direction you can predict. Between a 200-row and a
 * 1,000-row request on 2026-08-12, BONK's top-5 share went UP (27.5 -> 33.0),
 * USDC's stayed flat (50.8 -> 51.2) and BRETT's collapsed (85.7 -> 34.4). Hence
 * a script rather than an argument.
 *
 *   bun scripts/coins/calibrate-concentration.ts
 *
 * Run it through `fetchMobulaTokenTrades` deliberately, not against the raw
 * endpoint: the swap filter lives in that function, and a calibration taken
 * without it is what put BRETT at 89.6% (flagged) instead of its real 34%.
 */
import fs from "node:fs";
import path from "node:path";
import { fetchMobulaTokenTrades } from "../../lib/coins/mobula";

if (!process.env.MOBULA_API_KEY) {
    for (const file of [".env.local", ".env.production"]) {
        const p = path.join(process.cwd(), file);
        if (!fs.existsSync(p)) continue;
        const m = fs.readFileSync(p, "utf8").match(/^MOBULA_API_KEY=(.*)$/m);
        if (m) { process.env.MOBULA_API_KEY = m[1].replace(/["']/g, "").trim(); break; }
    }
}

// Two coins nobody would call wash-traded and one that reads concentrated, so
// the threshold is checked from both sides rather than only for false alarms.
const CASES = [
    { symbol: "BONK", chain: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    { symbol: "USDC", chain: "solana", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { symbol: "BRETT", chain: "base", address: "0x532f27101965dd16442E59d40670FaF5eBB142E4" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log("coin   requested  swaps  traders  top5%   roundTrip%  span");
for (const c of CASES) {
    for (const limit of [200, 1000]) {
        // The free plan is 1 request/second and answers 429 under any burst.
        let trades = null;
        for (let i = 0; i < 4 && !trades; i++) {
            trades = await fetchMobulaTokenTrades(c.chain, c.address, limit).catch(() => null);
            if (!trades) await sleep(4000);
        }
        if (!trades?.length) { console.log(`${c.symbol.padEnd(6)} ${String(limit).padEnd(10)} — rate limited`); continue; }

        const byTrader = new Map<string, { n: number; buys: number; sells: number }>();
        for (const t of trades) {
            const cur = byTrader.get(t.account) ?? { n: 0, buys: 0, sells: 0 };
            cur.n++;
            if (t.isBuy) cur.buys++; else cur.sells++;
            byTrader.set(t.account, cur);
        }
        const v = [...byTrader.values()];
        const top5 = [...v].sort((a, b) => b.n - a.n).slice(0, 5).reduce((s, t) => s + t.n, 0);
        const stamps = trades.map((t) => t.ts).filter(Boolean);
        const span = stamps.length > 1 ? Math.round((Math.max(...stamps) - Math.min(...stamps)) / 60) : 0;
        console.log(
            `${c.symbol.padEnd(6)} ${String(limit).padEnd(10)} ${String(trades.length).padEnd(6)} ${String(v.length).padEnd(8)} ` +
            `${(top5 / trades.length * 100).toFixed(1).padEnd(7)} ${(v.filter((t) => t.buys > 0 && t.sells > 0).length / v.length * 100).toFixed(1).padEnd(11)} ${span}min`,
        );
        await sleep(4000);
    }
}
