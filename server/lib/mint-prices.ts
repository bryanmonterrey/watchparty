import { db } from "@/db";
import { trades, tokens, mintPrices } from "@/db/schema/content";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

/**
 * Refresh the mint price/decimals cache for every mint seen in confirmed
 * trades over the last 30 days (the PnL universe) plus wSOL.
 *
 * - Prices: Jupiter lite price API, falling back to the launchpad's cached
 *   `tokens.priceUsd` for curve tokens Jupiter doesn't know yet.
 * - Decimals: Helius DAS getAssetBatch, fetched only while missing (immutable).
 */

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

const CASH = new Set([
    "So11111111111111111111111111111111111111111",
    WSOL_MINT,
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

export async function refreshMintPrices(): Promise<{ mints: number; priced: number }> {
    const since = new Date(Date.now() - 30 * 24 * 3600e3);
    const rows = await db
        .selectDistinct({ inputMint: trades.inputMint, outputMint: trades.outputMint })
        .from(trades)
        .where(and(eq(trades.status, "confirmed"), gte(trades.createdAt, since)));

    const mints = new Set<string>([WSOL_MINT]);
    for (const r of rows) {
        if (!CASH.has(r.inputMint)) mints.add(r.inputMint);
        if (!CASH.has(r.outputMint)) mints.add(r.outputMint);
    }
    const list = [...mints];

    // Decimals: only for mints we don't know yet.
    const known = list.length
        ? await db.select({ mint: mintPrices.mint }).from(mintPrices).where(and(inArray(mintPrices.mint, list), sql`${mintPrices.decimals} IS NOT NULL`))
        : [];
    const knownSet = new Set(known.map((k) => k.mint));
    const needDecimals = list.filter((m) => !knownSet.has(m));
    const decimalsByMint = new Map<string, number>();
    const heliusUrl = process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
    if (heliusUrl && needDecimals.length) {
        for (let i = 0; i < needDecimals.length; i += 100) {
            const batch = needDecimals.slice(i, i + 100);
            try {
                const res = await fetch(heliusUrl, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", id: "decimals", method: "getAssetBatch", params: { ids: batch } }),
                });
                const json = await res.json() as { result?: ({ id: string; token_info?: { decimals?: number } } | null)[] };
                for (const asset of json.result ?? []) {
                    if (asset?.token_info?.decimals != null) decimalsByMint.set(asset.id, asset.token_info.decimals);
                }
            } catch { /* next cron pass retries */ }
        }
    }
    decimalsByMint.set(WSOL_MINT, 9);

    // Prices: Jupiter lite, batched.
    //
    // ⚠️ v3, not v2. `price/v2` was RETIRED and answers 404 — silently, because
    // the fetch succeeds and only the parse comes back empty. Measured
    // 2026-08-10: 191 requests over 23h, 100% 404, and the consequence reached
    // much further than PnL. `recordSwaps` prices the SOL leg of every trade
    // through this map, so a dead price feed meant `solPrice = null` and every
    // single row in `coin_trades` was written with `amount_usd = NULL` — 0% USD
    // coverage on the whole tape. That is why `traderConcentration` had to be
    // built on trade COUNTS instead of volume.
    //
    // It was visible in zone analytics the whole time and I misread it as an
    // external prober. Worker subrequests are attributed to our zone, so
    // `--by host` (lite-api.jup.ag) is what identifies them as ours.
    //
    // Shape changed too: v3 returns a FLAT map keyed by mint with no `data`
    // wrapper, and the price is `usdPrice` as a NUMBER (v2 used `data[mint].price`
    // as a string). Parsing v3 with the v2 shape yields an empty map and no
    // error, which is the same silent failure one layer up.
    const priceByMint = new Map<string, number>();
    for (let i = 0; i < list.length; i += 100) {
        const batch = list.slice(i, i + 100);
        try {
            const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${batch.join(",")}`, {
                headers: { Accept: "application/json" },
            });
            if (!res.ok) {
                // Loudly, because the last time this broke it stayed broken.
                console.error(`[mint-prices] jupiter price/v3 ${res.status}`);
                continue;
            }
            const json = await res.json() as Record<string, { usdPrice?: number; decimals?: number } | null>;
            for (const [mint, p] of Object.entries(json ?? {})) {
                const price = Number(p?.usdPrice);
                if (Number.isFinite(price) && price > 0) priceByMint.set(mint, price);
                // v3 carries decimals, so a mint priced here never needs the
                // Helius DAS lookup above — free, and Helius credits are the
                // scarcest thing in this system.
                if (typeof p?.decimals === "number" && !decimalsByMint.has(mint)) {
                    decimalsByMint.set(mint, p.decimals);
                }
            }
        } catch { /* fall through to launchpad fallback */ }
    }

    // Launchpad fallback for curve tokens Jupiter doesn't price yet.
    const unpriced = list.filter((m) => !priceByMint.has(m));
    if (unpriced.length) {
        const launchpad = await db
            .select({ tokenAddress: tokens.tokenAddress, priceUsd: tokens.priceUsd })
            .from(tokens)
            .where(inArray(tokens.tokenAddress, unpriced));
        for (const t of launchpad) {
            if (t.tokenAddress && t.priceUsd && t.priceUsd > 0) priceByMint.set(t.tokenAddress, t.priceUsd);
        }
    }

    let priced = 0;
    for (const mint of list) {
        const priceUsd = priceByMint.get(mint) ?? null;
        const decimals = decimalsByMint.get(mint) ?? null;
        if (priceUsd != null) priced++;
        await db
            .insert(mintPrices)
            .values({ mint, decimals, priceUsd })
            .onConflictDoUpdate({
                target: mintPrices.mint,
                set: {
                    ...(priceUsd != null ? { priceUsd } : {}),
                    ...(decimals != null ? { decimals } : {}),
                    updatedAt: sql`now()`,
                },
            });
    }
    return { mints: list.length, priced };
}

/** price + decimals for a set of mints (for unrealized marks + USD estimates). */
export async function getMintPriceMap(mints: string[]): Promise<Map<string, { priceUsd: number | null; decimals: number | null }>> {
    if (mints.length === 0) return new Map();
    const rows = await db.select().from(mintPrices).where(inArray(mintPrices.mint, mints));
    return new Map(rows.map((r) => [r.mint, { priceUsd: r.priceUsd, decimals: r.decimals }]));
}
