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

// The platform's most-active live coins — the raw material the "What's
// happening" card is written from (no hashtags, ever; this app is coins-first).
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

// GLM (Cloudflare Workers AI) writes short "what's happening" headlines from the
// live coin metadata — same access path as the predictions factory
// (lib/predictions/factory.ts): the account's OpenAI-compatible endpoint using
// CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN. Model is env-swappable via
// DISCOVER_NEWS_MODEL (defaults to GLM-5.2, same as predictions). Returns null
// on any miss so the caller falls back to plain coin movers.
async function glmCoinNews(coins: HotCoin[], count: number): Promise<TrendingItem[] | null> {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!account || !token || coins.length === 0) return null;

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
                            `You write the "What's happening" card for a coins-first social trading app. ` +
                            `Given live coin metadata, write exactly ${count} punchy, factual one-line headlines about ` +
                            `what is moving and why it matters. Each headline references one coin by its ticker (with a $). ` +
                            `No hype, no emojis, no financial advice, max 90 characters. ` +
                            `Reply with ONLY a JSON object, no prose: ` +
                            `{"items":[{"title":string,"meta":string,"ticker":string}]} where meta is a short tag such as ` +
                            `"Runner", "New launch", "High volume", or "Cooling off".`,
                    },
                    { role: "user", content: JSON.stringify({ now: new Date().toISOString(), coins }) },
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
                    meta: String(it?.meta ?? "Trending"),
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

// Fallback when GLM is unavailable — biggest movers stated plainly from the same
// coin data. Still coins, still no hashtags, so the card degrades gracefully.
function coinMovers(coins: HotCoin[], count: number): TrendingItem[] {
    return coins
        .filter((c) => (c.priceChange24h ?? 0) !== 0 && c.ticker)
        .sort((a, b) => Math.abs(b.priceChange24h ?? 0) - Math.abs(a.priceChange24h ?? 0))
        .slice(0, count)
        .map((c) => {
            const ch = c.priceChange24h ?? 0;
            return {
                title: `$${c.ticker} ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(ch >= 100 ? 0 : 1)}% today`,
                meta: ch >= 0 ? "Runner" : "Cooling off",
                ticker: c.ticker ?? undefined,
                tokenAddress: c.tokenAddress ?? null,
            };
        });
}

export const discoverRouter = router({
    // "What's happening" — GLM-written coin news from live platform coins, with
    // a plain-movers fallback. Coins-first, never hashtags. Cached 5min so the
    // rail is cheap and the model runs at most once per window.
    trending: publicProcedure
        .input(z.object({ limit: z.number().min(1).max(10).default(5) }).optional())
        .query(async ({ input }) => {
            const count = input?.limit ?? 5;
            return withCache(`discover:coin-news:v1:${count}`, 300, async () => {
                const coins = await hotCoins(12);
                if (coins.length === 0) return { source: "empty" as const, items: [] as TrendingItem[] };
                const glm = await glmCoinNews(coins, count);
                if (glm && glm.length) return { source: "glm" as const, items: glm };
                return { source: "coins" as const, items: coinMovers(coins, count) };
            });
        }),
});
