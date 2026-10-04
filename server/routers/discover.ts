import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { db } from "@/db";
import { tokens } from "@/db/schema/content/token";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { redis, redisBreakerOpen } from "@/lib/cache";
import { after } from "next/server";

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
            // The model never blocks the card. GLM-5.2 is a reasoning model and
            // regularly needs more than its 6 s budget here; while the Redis
            // cache was down (2026-10-03) every request paid that timeout and
            // the card took 7–8 s to settle on the movers fallback anyway. So:
            // answer with the deterministic movers now, and let the model's
            // version replace the cached entry for the next viewer (next/server
            // `after` = waitUntil on Workers). With the cache unavailable the
            // model's output has nowhere to go, so it is not even asked.
            const key = `discover:crypto-news:v3:${count}`;
            try {
                const cached = await redis.get<{ source: "glm" | "market"; items: TrendingItem[] }>(key);
                if (cached?.items?.length) return cached;
            } catch { /* cache down — compute */ }

            const [coins, majors] = await Promise.all([hotCoins(12), getMajors()]);
            if (coins.length === 0 && majors.length === 0) {
                return { source: "empty" as const, items: [] as TrendingItem[] };
            }
            const market = { source: "market" as const, items: marketMovers(coins, majors, count) };
            if (redisBreakerOpen()) return market;
            after(async () => {
                try {
                    await redis.set(key, market, { ex: 300, nx: true });
                    const glm = await glmCryptoNews(coins, majors, count);
                    if (glm && glm.length) await redis.set(key, { source: "glm" as const, items: glm }, { ex: 300 });
                } catch { /* best-effort */ }
            });
            return market;
        }),
});
