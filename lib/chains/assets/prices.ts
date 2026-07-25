// Price lookups for the multichain wallet.
//
// Both sources are free and keyless, matching what the Solana wallet already
// uses: CoinGecko for native coins, DexScreener for contract-addressed tokens.

import { TTL, redis } from "@/lib/cache";
import type { ChainId } from "../types";

/** CoinGecko ids for each chain's native coin. */
const NATIVE_COIN_IDS: Record<ChainId, string> = {
  solana: "solana",
  ethereum: "ethereum",
  bitcoin: "bitcoin",
  base: "ethereum", // Base gas is ETH
  sui: "sui",
  polygon: "matic-network",
  hyperevm: "hyperliquid",
  robinhood: "ethereum", // Robinhood Chain gas is ETH
};

/** DexScreener chain slugs, for token (non-native) prices. */
export const DEXSCREENER_SLUGS: Partial<Record<ChainId, string>> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  polygon: "polygon",
  hyperevm: "hyperevm",
  sui: "sui",
};

export interface PriceQuote {
  price: number;
  priceChange24h?: number;
}

/** CoinGecko: price + 24h change, but the keyless tier rate-limits hard. */
async function coingeckoNativePrice(coinId: string): Promise<PriceQuote | null> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}` +
        `&vs_currencies=usd&include_24hr_change=true`,
      { headers: { accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    const entry = data[coinId];
    if (!entry?.usd) return null;
    return { price: entry.usd, priceChange24h: entry.usd_24h_change };
  } catch {
    return null;
  }
}

/** Alchemy Prices: no 24h change, but keyed and reliable. Fallback only. */
async function alchemyNativePrice(symbol: string): Promise<PriceQuote | null> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol?symbols=${symbol}`,
      { headers: { accept: "application/json" } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { symbol: string; prices?: { currency: string; value: string }[] }[];
    };
    const usd = body.data?.[0]?.prices?.find((p) => p.currency === "usd")?.value;
    const price = Number(usd);
    return Number.isFinite(price) && price > 0 ? { price } : null;
  } catch {
    return null;
  }
}

/**
 * USD price of a chain's native coin.
 *
 * CoinGecko first because it carries the 24h change the wallet displays;
 * Alchemy as fallback so a rate-limit can't blank every balance's USD value.
 * Failures are deliberately NOT cached — caching a null would extend one
 * upstream hiccup across the whole TTL.
 */
export async function getNativePrice(chain: ChainId): Promise<PriceQuote | null> {
  const coinId = NATIVE_COIN_IDS[chain];
  if (!coinId) return null;

  const key = `price:native:${coinId}`;
  try {
    const cached = await redis.get<PriceQuote>(key);
    if (cached) return cached;
  } catch {
    // Redis unavailable — fall through to a live fetch.
  }

  const quote =
    (await coingeckoNativePrice(coinId)) ?? (await alchemyNativePrice(NATIVE_SYMBOLS[chain]));
  if (!quote) return null;

  try {
    await redis.set(key, quote, { ex: TTL.SOL_PRICE });
  } catch {
    // Redis unavailable — serve the value anyway.
  }
  return quote;
}

/** Ticker per chain, for the Alchemy by-symbol fallback. */
const NATIVE_SYMBOLS: Record<ChainId, string> = {
  solana: "SOL",
  ethereum: "ETH",
  bitcoin: "BTC",
  base: "ETH",
  sui: "SUI",
  polygon: "POL",
  hyperevm: "HYPE",
  robinhood: "ETH",
};

/**
 * USD prices for token contracts on one chain, keyed by lowercased address.
 * DexScreener caps a request at 30 addresses, so this chunks.
 */
export async function getTokenPrices(
  chain: ChainId,
  contracts: string[]
): Promise<Record<string, PriceQuote>> {
  if (contracts.length === 0) return {};
  const slug = DEXSCREENER_SLUGS[chain];
  if (!slug) return {};

  const unique = [...new Set(contracts.map((c) => c.toLowerCase()))];
  const out: Record<string, PriceQuote> = {};

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    try {
      const res = await fetch(
        `https://api.dexscreener.com/tokens/v1/${slug}/${chunk.join(",")}`,
        { headers: { accept: "application/json" } }
      );
      if (!res.ok) continue;
      const pairs = (await res.json()) as any[];
      if (!Array.isArray(pairs)) continue;

      for (const pair of pairs) {
        const address = pair?.baseToken?.address?.toLowerCase();
        const priceUsd = Number(pair?.priceUsd);
        if (!address || !Number.isFinite(priceUsd) || priceUsd <= 0) continue;
        // Keep the deepest pair per token — thin pools give wild prices.
        const existing = out[address];
        if (existing && existing.price > 0 && (pair?.liquidity?.usd ?? 0) === 0) continue;
        out[address] = {
          price: priceUsd,
          priceChange24h:
            pair?.priceChange?.h24 !== undefined ? Number(pair.priceChange.h24) : undefined,
        };
      }
    } catch {
      // Price data is best-effort — a failed chunk just leaves those unpriced.
    }
  }

  return out;
}
