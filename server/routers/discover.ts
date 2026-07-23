import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { withCache } from "@/lib/cache";

export type TrendingItem = {
    title: string;
    meta: string;
    ticker?: string;
    tokenAddress?: string | null;
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

// 24h move for one major from the Pyth benchmarks TradingView shim — same
// source lib/predictions/factory.ts uses. Hourly candles over ~26h; current =
// last close, reference = the close nearest 24h ago.
async function majorMove(symbol: string, label: string): Promise<Major | null> {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 26 * 3600;
    try {
        const res = await fetch(
            `https://benchmarks.pyth.network/v1/shims/tradingview/history` +
            `?symbol=${encodeURIComponent(symbol)}&resolution=60&from=${from}&to=${now}`,
        );
        const d = (await res.json()) as { s: string; c: number[]; t: number[] };
        if (d.s !== "ok" || d.c.length < 2) return null;
        const price = d.c[d.c.length - 1];
        const target = now - 24 * 3600;
        let refIdx = 0;
        for (let i = 0; i < d.t.length; i++) {
            if (d.t[i] <= target) refIdx = i;
            else break;
        }
        const ref = d.c[refIdx];
        const change = ref ? ((price - ref) / ref) * 100 : 0;
        return { label, price, change };
    } catch {
        return null;
    }
}

async function getMajors(): Promise<Major[]> {
    const results = await Promise.all([
        majorMove("Crypto.BTC/USD", "BTC"),
        majorMove("Crypto.ETH/USD", "ETH"),
        majorMove("Crypto.SOL/USD", "SOL"),
    ]);
    return results.filter((m): m is Major => m !== null);
}

// GLM (Cloudflare Workers AI) writes short crypto-news headlines GROUNDED in the
// real numbers we pass (majors from Pyth + live platform coins) — same account
// API path as the predictions factory (lib/predictions/factory.ts), no separate
// worker URL. Model env-swappable via DISCOVER_NEWS_MODEL. Returns null on any
// miss so the caller falls back to formatting the same numbers directly.
async function glmCryptoNews(coins: HotCoin[], majors: Major[], count: number): Promise<TrendingItem[] | null> {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!account || !token) return null;

    try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({
                model: process.env.DISCOVER_NEWS_MODEL ?? process.env.PREDICTIONS_FACTORY_MODEL ?? "@cf/zai-org/glm-5.2",
                messages: [
                    {
                        role: "system",
                        content:
                            `You write the "What's happening" crypto-news card for a coins-first social trading app. ` +
                            `Using ONLY the numbers provided (majors = BTC/ETH/SOL 24h moves; coins = live platform coins), ` +
                            `write exactly ${count} punchy, factual one-line headlines about what is moving over the last 24h. ` +
                            `Each headline references one asset by ticker (with a $). Do NOT invent events, causes, prices, ` +
                            `or news not implied by the numbers. No hype, no emojis, no financial advice, max 90 chars. ` +
                            `Prefer platform coins when they are notable; otherwise use the majors. ` +
                            `Reply with ONLY a JSON object, no prose: ` +
                            `{"items":[{"title":string,"meta":string,"ticker":string}]} where meta is a short tag like ` +
                            `"Majors", "Runner", "New launch", "High volume", or "Cooling off".`,
                    },
                    { role: "user", content: JSON.stringify({ now: new Date().toISOString(), majors, coins }) },
                ],
                response_format: { type: "json_object" },
                max_tokens: 1200,
            }),
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) {
            console.error("discover.trending workers-ai failed:", res.status, (await res.text()).slice(0, 200));
            return null;
        }
        const d = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = d.choices?.[0]?.message?.content;
        if (!content) return null;

        const parsed = JSON.parse(content) as { items?: unknown };
        const raw = Array.isArray(parsed.items) ? parsed.items : null;
        if (!raw) return null;

        const byTicker = new Map(coins.map((c) => [(c.ticker ?? "").toUpperCase(), c]));
        return (raw as any[])
            .map((it) => {
                const ticker = String(it?.ticker ?? "").toUpperCase().replace(/^\$/, "");
                const coin = byTicker.get(ticker);
                return {
                    title: String(it?.title ?? "").slice(0, 120),
                    meta: String(it?.meta ?? "Crypto"),
                    ticker: ticker || undefined,
                    tokenAddress: coin?.tokenAddress ?? null,
                };
            })
            .filter((it) => it.title)
            .slice(0, count);
    } catch {
        return null;
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
    // "What's happening" — GLM-written crypto news grounded in real majors (Pyth)
    // + live platform coins, with a deterministic movers fallback. Always
    // populated (majors are near-always available), coins-first, never hashtags.
    // Cached 5min so the model runs at most once per window.
    trending: publicProcedure
        .input(z.object({ limit: z.number().min(1).max(10).default(5) }).optional())
        .query(async ({ input }) => {
            const count = input?.limit ?? 5;
            return withCache(`discover:crypto-news:v2:${count}`, 300, async () => {
                const [coins, majors] = await Promise.all([hotCoins(12), getMajors()]);
                if (coins.length === 0 && majors.length === 0) {
                    return { source: "empty" as const, items: [] as TrendingItem[] };
                }
                const glm = await glmCryptoNews(coins, majors, count);
                if (glm && glm.length) return { source: "glm" as const, items: glm };
                return { source: "market" as const, items: marketMovers(coins, majors, count) };
            });
        }),
});
