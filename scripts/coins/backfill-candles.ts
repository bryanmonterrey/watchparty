/**
 * Project candles from trades ALREADY on the tape.
 *
 * `updateCandlesFromTrades` runs on ingest, so it only ever sees new swaps —
 * every trade recorded before it existed produced no bar. That left the board's
 * 24h sparkline drawing an em-dash on 197 of 199 rows while `coin_trades` held
 * a day of real activity for roughly forty tokens.
 *
 * This is the one-time catch-up. Same projection, same merge rules, no API
 * calls: it reads the tape and writes the bars those trades imply.
 *
 *   bun scripts/coins/backfill-candles.ts --db prod
 *   bun scripts/coins/backfill-candles.ts --db prod --hours 48 --dry
 *
 * Safe to re-run — the upsert widens high/low and moves the close, so a second
 * pass over the same trades converges on the same bar rather than doubling it.
 * Volume is the exception and WILL double, which is why --dry exists and why
 * this is a script rather than a cron.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

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
const hours = Number(arg("hours", "24"));
const dry = process.argv.includes("--dry");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const sql = postgres(url, { max: 1, prepare: false });
console.log(`db: ${target} (${new URL(url).host})  window: ${hours}h  ${dry ? "(dry run)" : ""}\n`);

const since = Math.floor(Date.now() / 1000) - hours * 3600;

/**
 * Bucketed in SQL rather than in JS.
 *
 * The alternative is pulling every trade into memory and grouping there — on a
 * tape that takes every swap on every watched pool, that is an unbounded read
 * to compute an aggregate Postgres can do in one pass. The window functions
 * pick open and close by time within each bucket, which is exactly what
 * first/last mean for a candle.
 */
const rows = await sql<
    { network: string; pool_address: string; resolution: string; ts: number; o: number; h: number; l: number; c: number; v: number }[]
>`
    WITH priced AS (
        SELECT network, pool_address, ts,
               amount_usd / abs(amount_token) AS price,
               abs(amount_token) AS vol
        FROM coin_trades
        WHERE ts >= ${since}
          AND amount_usd > 0
          AND amount_token IS NOT NULL
          AND abs(amount_token) > 0
    ),
    bucketed AS (
        SELECT network, pool_address, price, vol,
               (ts / 3600) * 3600 AS bucket_60,
               (ts / 60) * 60     AS bucket_1,
               ts
        FROM priced
    )
    SELECT network, pool_address, '60' AS resolution, bucket_60 AS ts,
           (array_agg(price ORDER BY ts ASC))[1]  AS o,
           max(price)                              AS h,
           min(price)                              AS l,
           (array_agg(price ORDER BY ts DESC))[1] AS c,
           sum(vol)                                AS v
    FROM bucketed GROUP BY network, pool_address, bucket_60
    UNION ALL
    SELECT network, pool_address, '1' AS resolution, bucket_1 AS ts,
           (array_agg(price ORDER BY ts ASC))[1]  AS o,
           max(price)                              AS h,
           min(price)                              AS l,
           (array_agg(price ORDER BY ts DESC))[1] AS c,
           sum(vol)                                AS v
    FROM bucketed GROUP BY network, pool_address, bucket_1
`;

const pools = new Set(rows.map((r) => r.pool_address));
console.log(`${rows.length} bars across ${pools.size} pools`);
const hourly = rows.filter((r) => r.resolution === "60");
console.log(`  hourly ("60", what the sparkline reads): ${hourly.length}`);

if (dry) {
    console.log("\ndry run — nothing written");
    await sql.end();
    process.exit(0);
}

let written = 0;
// Chunked: one statement with tens of thousands of value tuples will exceed
// the parameter limit long before it exceeds anything else.
for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await sql`
        INSERT INTO coin_candles ${sql(chunk, "network", "pool_address", "resolution", "ts", "o", "h", "l", "c", "v")}
        ON CONFLICT (network, pool_address, resolution, ts) DO UPDATE SET
            h = greatest(coin_candles.h, excluded.h),
            l = least(coin_candles.l, excluded.l),
            c = excluded.c,
            v = greatest(coin_candles.v, excluded.v)
    `;
    written += chunk.length;
    process.stdout.write(`  written ${written}/${rows.length}\r`);
}
console.log(`\n\nwrote ${written} bars`);
await sql.end();
