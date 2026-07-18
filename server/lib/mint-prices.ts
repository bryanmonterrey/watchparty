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
    const priceByMint = new Map<string, number>();
    for (let i = 0; i < list.length; i += 100) {
        const batch = list.slice(i, i + 100);
        try {
            const res = await fetch(`https://lite-api.jup.ag/price/v2?ids=${batch.join(",")}`, {
                headers: { Accept: "application/json" },
            });
            const json = await res.json() as { data?: Record<string, { price?: string } | null> };
            for (const [mint, p] of Object.entries(json.data ?? {})) {
                const price = Number(p?.price);
                if (Number.isFinite(price) && price > 0) priceByMint.set(mint, price);
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
