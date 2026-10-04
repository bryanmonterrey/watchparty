import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { withCache } from "@/lib/cache";
import { fetchCryptoNews, timeAgo } from "@/lib/news/crypto-news";

export type TrendingItem = {
    title: string;
    meta: string;
    ticker?: string;
    tokenAddress?: string | null;
    /** Set for a news headline — the row links out to the article. */
    url?: string;
};

type HotCoin = {
    name: string | null;
    ticker: string | null;
    tokenAddress: string | null;
    priceUsd: number | null;
    priceChange24h: number | null;
    volume24hUsd: number | null;
    marketCapUsd: number | null;
    description: string | null;
};

type Major = { label: string; price: number; change: number };

// The platform's most-active live coins — real material for the card.
async function hotCoins(limit: number): Promise<HotCoin[]> {
    return db
        .select({
            name: tokens.name,
            ticker: tokens.ticker,
            tokenAddress: tokens.tokenAddress,
            priceUsd: tokens.priceUsd,
            priceChange24h: tokens.priceChange24h,
            volume24hUsd: tokens.volume24hUsd,
            marketCapUsd: tokens.marketCapUsd,
            description: tokens.description,
        })
        .from(tokens)
        .where(and(eq(tokens.status, "live"), isNotNull(tokens.poolAddress), isNotNull(tokens.priceUsd)))
        .orderBy(sql`${tokens.volume24hUsd} desc nulls last`)
        .limit(limit);
}

// 24h moves for the majors, from CoinGecko's keyless simple-price endpoint.
//
// This read Pyth's TradingView shim until 2026-10-03. Pyth put every public
// endpoint (benchmarks AND Hermes) behind an API key on 2026-08-26, so the
// shim 404s and Hermes 401s; majors came back empty, and with the platform
// coin list also empty the card returned `source: "empty"` and the UI hid
// it — the "What's happening is just disappearing" report. The perps charts
// (/api/pyth-udf) and the predictions resolver still read Pyth and still
// need a PYTH_API_KEY; this card does not, so it gets the free source.
// One request for all three, with a deadline — no default fetch timeout on
// workerd, and a hung provider here would hold the whole card.
const MAJORS = [
    { id: "bitcoin", label: "BTC" },
    { id: "ethereum", label: "ETH" },
    { id: "solana", label: "SOL" },
] as const;

async function getMajors(): Promise<Major[]> {
    try {
        const res = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${MAJORS.map((m) => m.id).join(",")}` +
            `&vs_currencies=usd&include_24hr_change=true`,
            { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } },
        );
        if (!res.ok) return [];
        const d = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
        return MAJORS.flatMap(({ id, label }) => {
            const row = d[id];
            if (!row || typeof row.usd !== "number") return [];
            return [{ label, price: row.usd, change: typeof row.usd_24h_change === "number" ? row.usd_24h_change : 0 }];
        });
    } catch {
        return [];
    }
}

// Deterministic fallback from the same real numbers — majors first (always
// available from Pyth), then the biggest platform movers. Keeps the card
// populated when GLM is unavailable.
function marketMovers(coins: HotCoin[], majors: Major[], count: number): TrendingItem[] {
    const majorItems: TrendingItem[] = majors.map((m) => ({
        title: `$${m.label} ${m.change >= 0 ? "up" : "down"} ${Math.abs(m.change).toFixed(1)}% over 24h`,
        meta: "Majors",
        ticker: m.label,
        tokenAddress: null,
    }));

    const coinItems: TrendingItem[] = coins
        .filter((c) => (c.priceChange24h ?? 0) !== 0 && c.ticker)
        .sort((a, b) => Math.abs(b.priceChange24h ?? 0) - Math.abs(a.priceChange24h ?? 0))
        .map((c) => {
            const ch = c.priceChange24h ?? 0;
            return {
                title: `$${c.ticker} ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(ch >= 100 ? 0 : 1)}% today`,
                meta: ch >= 0 ? "Runner" : "Cooling off",
                ticker: c.ticker ?? undefined,
                tokenAddress: c.tokenAddress ?? null,
            };
        });

    // Interleave a couple of platform movers between the majors so the card
    // isn't all BTC/ETH/SOL when there are notable coins.
    return [...coinItems.slice(0, 2), ...majorItems, ...coinItems.slice(2)].slice(0, count);
}

export const discoverRouter = router({
    // "What's happening" — real headlines from the outlets' RSS feeds
    // (lib/news/crypto-news), newest first, two per outlet at most. The price
    // movers from the majors + live platform coins are the FALLBACK, for when
    // every feed is down: the owner's rule (2026-10-03) is actual news, not
    // price lines. Cached 10 min when the cache is up; the feeds answer in
    // ~0.3 s when it isn't.
    trending: publicProcedure
        .input(z.object({ limit: z.number().min(1).max(10).default(5) }).optional())
        .query(async ({ input }) => {
            const count = input?.limit ?? 5;
            return withCache(`discover:crypto-news:v4:${count}`, 600, async () => {
                const news = await fetchCryptoNews(count);
                if (news.length) {
                    return {
                        source: "news" as const,
                        items: news.map((h): TrendingItem => ({
                            title: h.title,
                            meta: `${h.source} · ${timeAgo(h.publishedAt)}`,
                            url: h.url,
                        })),
                    };
                }
                const [coins, majors] = await Promise.all([hotCoins(12), getMajors()]);
                if (coins.length === 0 && majors.length === 0) {
                    return { source: "empty" as const, items: [] as TrendingItem[] };
                }
                return { source: "market" as const, items: marketMovers(coins, majors, count) };
            });
        }),
});
