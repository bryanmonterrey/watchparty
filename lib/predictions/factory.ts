import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { predictionMarkets, predictionOutcomes } from "@/db/schema/content/predictions";
import { tokens } from "@/db/schema/content/token";
import { resolveMarketCore } from "@/lib/predictions/resolve";
import { emitPredictionEvent } from "@/lib/coin-feed/emit";

// AI market factory — the solo-operator answer to "who creates and resolves
// prediction markets?". Claude generates timely markets from live platform
// data; every generated market carries a machine-checkable resolution_spec,
// and the cron resolves them deterministically after close. No moderation
// team required: the human only ever sees markets that resolve themselves.
//
// Market creation stays admin-gated for HUMANS (resolution authority — see
// Polymarket/Kalshi); the factory writes server-side with creatorId
// "ai-factory", which is the same authority (the platform) wearing a robot
// hat.

export const AI_CREATOR_ID = "ai-factory";
/** Keep this many open markets on the board. */
const TARGET_OPEN_MARKETS = 8;
const MAX_GENERATED_PER_RUN = 4;

/** Machine-checkable resolution recipes. */
export type ResolutionSpec =
    | {
        /** platform token price at resolution time (tokens table, 1-min sync) */
        type: "token_price";
        mint: string;
        /** resolves outcome 0 if priceUsd >= threshold, else outcome 1 */
        thresholdUsd: number;
    }
    | {
        /** major-asset price from Pyth benchmarks at the market's close time */
        type: "pyth_price";
        ticker: string; // e.g. "Crypto.SOL/USD"
        thresholdUsd: number;
    };

// ─── Deterministic resolution ───────────────────────────────

/** Pyth benchmarks close price at (or just before) a timestamp. */
async function pythPriceAt(ticker: string, at: Date): Promise<number | null> {
    const to = Math.floor(at.getTime() / 1000);
    const from = to - 3600;
    try {
        const res = await fetch(
            `https://benchmarks.pyth.network/v1/shims/tradingview/history` +
            `?symbol=${encodeURIComponent(ticker)}&resolution=1&from=${from}&to=${to}`,
        );
        const d = (await res.json()) as { s: string; c: number[] };
        if (d.s !== "ok" || !d.c.length) return null;
        return d.c[d.c.length - 1];
    } catch {
        return null;
    }
}

/**
 * Resolve every open, past-close market that carries a resolution_spec.
 * Returns [resolved, skipped] counts. Markets it can't price are left for
 * manual resolution (they show as "Awaiting result").
 */
export async function autoResolveDueMarkets(): Promise<{ resolved: number; skipped: number }> {
    const due = await db
        .select()
        .from(predictionMarkets)
        .where(and(
            eq(predictionMarkets.status, "open"),
            lt(predictionMarkets.closesAt, new Date()),
            sql`${predictionMarkets.resolutionSpec} is not null`,
        ))
        .limit(20);

    let resolved = 0;
    let skipped = 0;
    for (const market of due) {
        const spec = market.resolutionSpec as ResolutionSpec;
        let price: number | null = null;
        let source = "";

        if (spec.type === "pyth_price") {
            price = await pythPriceAt(spec.ticker, market.closesAt);
            source = `Pyth ${spec.ticker} at close`;
        } else if (spec.type === "token_price") {
            const [t] = await db
                .select({ priceUsd: tokens.priceUsd })
                .from(tokens)
                .where(eq(tokens.tokenAddress, spec.mint))
                .limit(1);
            price = t?.priceUsd ?? null;
            source = "platform market price at resolution";
        }

        if (price === null || !Number.isFinite(spec.thresholdUsd)) {
            skipped++;
            continue;
        }

        // Convention baked into generation: outcome 0 = "hits" (>= threshold),
        // outcome 1 = "misses".
        const winner = price >= spec.thresholdUsd ? 0 : 1;
        const note = `Auto-resolved: ${source} was $${price.toPrecision(6)} vs the $${spec.thresholdUsd} line.`;
        if (await resolveMarketCore(market.id, winner, note)) resolved++;
        else skipped++;
    }
    return { resolved, skipped };
}

// ─── Generation (Claude) ────────────────────────────────────

type GeneratedMarket = {
    question: string;
    description: string;
    category: string;
    outcomes: [string, string];
    closes_in_hours: number;
    resolution: ResolutionSpec;
};

const OUTPUT_SCHEMA = {
    type: "object" as const,
    properties: {
        markets: {
            type: "array" as const,
            items: {
                type: "object" as const,
                properties: {
                    question: { type: "string" as const },
                    description: { type: "string" as const },
                    category: { type: "string" as const, enum: ["crypto", "tokens"] },
                    outcomes: {
                        type: "array" as const,
                        items: { type: "string" as const },
                    },
                    closes_in_hours: { type: "integer" as const, enum: [24, 48, 72, 168] },
                    resolution: {
                        type: "object" as const,
                        properties: {
                            type: { type: "string" as const, enum: ["token_price", "pyth_price"] },
                            mint: { type: "string" as const },
                            ticker: { type: "string" as const },
                            thresholdUsd: { type: "number" as const },
                        },
                        required: ["type", "thresholdUsd"],
                        additionalProperties: false,
                    },
                },
                required: ["question", "description", "category", "outcomes", "closes_in_hours", "resolution"],
                additionalProperties: false,
            },
        },
    },
    required: ["markets"],
    additionalProperties: false,
};

const SYSTEM_PROMPT = [
    "You create pari-mutuel prediction markets for watchparty, a Solana streaming + trading platform.",
    "Every market MUST be objectively resolvable by a price comparison at close — no vibes, no interpretation.",
    "Rules:",
    "- Exactly two outcomes. Outcome 0 is the 'price at or above the line' side, outcome 1 is 'below'. Phrase them naturally (e.g. ['$180 or above', 'Below $180']).",
    "- Pick thresholds that are genuinely uncertain (near current price, interesting round numbers) — a market that's 99% one side is boring.",
    "- For majors (SOL/BTC/ETH) use resolution.type 'pyth_price' with the exact ticker provided and NO mint. Category 'crypto'.",
    "- For platform tokens use resolution.type 'token_price' with the exact mint provided and NO ticker. Category 'tokens'. Only use tokens with real volume.",
    "- The description must state the exact resolution rule: the data source, the line, and when it's checked.",
    "- Questions must not duplicate any existing open market.",
    "- Write like a sharp crypto-native product, not a bureaucrat. Short questions.",
].join("\n");

/** Anthropic path — best quality, used when a key is configured. */
async function generateViaAnthropic(userPayload: string): Promise<string | null> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPayload }],
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text : null;
}

/**
 * Cloudflare Workers AI path — free tier, reuses the account + token the
 * deploy pipeline already has. OpenAI-compatible endpoint; json_object mode
 * (no schema enforcement server-side, so the validation below is what
 * guarantees shape — same guard both providers get).
 * Model is env-swappable: "@cf/zai-org/glm-5.2" (default) and
 * "@cf/moonshotai/kimi-k2.7-code" both live on the account's catalog.
 */
async function generateViaWorkersAI(userPayload: string): Promise<string | null> {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!account || !token) return null;
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
            model: process.env.PREDICTIONS_FACTORY_MODEL ?? "@cf/zai-org/glm-5.2",
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT +
                        "\nReply with ONLY a JSON object, no prose, exactly matching this schema: " +
                        JSON.stringify(OUTPUT_SCHEMA),
                },
                { role: "user", content: userPayload },
            ],
            response_format: { type: "json_object" },
            max_tokens: 4000,
        }),
    });
    if (!res.ok) {
        console.error("workers-ai generation failed:", res.status, (await res.text()).slice(0, 300));
        return null;
    }
    const d = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content ?? null;
}

/**
 * Generate up to `count` markets from live platform + majors data.
 * Provider: Anthropic when ANTHROPIC_API_KEY is set, else Cloudflare
 * Workers AI (free) via the existing CF credentials. Returns [] when
 * neither is available — generation is optional, resolution never is.
 */
export async function generateMarkets(count: number): Promise<GeneratedMarket[]> {
    if (count <= 0) return [];

    // Live context: majors from Pyth + the platform's most-traded tokens.
    const majors = await Promise.all(
        ["Crypto.SOL/USD", "Crypto.BTC/USD", "Crypto.ETH/USD"].map(async (t) => ({
            ticker: t,
            price: await pythPriceAt(t, new Date()),
        })),
    );
    const hotTokens = await db
        .select({ name: tokens.name, ticker: tokens.ticker, mint: tokens.tokenAddress, priceUsd: tokens.priceUsd, volume24hUsd: tokens.volume24hUsd, marketCapUsd: tokens.marketCapUsd })
        .from(tokens)
        .where(and(eq(tokens.status, "live"), sql`${tokens.priceUsd} is not null`))
        .orderBy(sql`${tokens.volume24hUsd} desc nulls last`)
        .limit(8);
    const existing = await db
        .select({ question: predictionMarkets.question })
        .from(predictionMarkets)
        .where(eq(predictionMarkets.status, "open"));

    const userPayload = JSON.stringify({
        now: new Date().toISOString(),
        majors,
        platform_tokens: hotTokens,
        existing_open_questions: existing.map((e) => e.question),
        markets_wanted: count,
    });

    const raw = process.env.ANTHROPIC_API_KEY
        ? await generateViaAnthropic(userPayload)
        : await generateViaWorkersAI(userPayload);
    if (!raw) return [];

    let parsed: { markets: GeneratedMarket[] };
    try {
        parsed = JSON.parse(raw) as { markets: GeneratedMarket[] };
        if (!Array.isArray(parsed.markets)) return [];
    } catch {
        return [];
    }

    // Trust but verify — the spec must reference real data or we drop it.
    const validMints = new Set(hotTokens.map((t) => t.mint));
    const validTickers = new Set(majors.map((m) => m.ticker));
    return parsed.markets
        .filter((m) =>
            m.outcomes.length === 2 &&
            m.question.length >= 8 &&
            Number.isFinite(m.resolution.thresholdUsd) &&
            (m.resolution.type === "pyth_price"
                ? !!m.resolution.ticker && validTickers.has(m.resolution.ticker)
                : !!m.resolution.mint && validMints.has(m.resolution.mint)),
        )
        .slice(0, count);
}

/** Insert generated markets (server-side — no admin session involved). */
export async function insertGeneratedMarkets(markets: GeneratedMarket[]): Promise<number> {
    let created = 0;
    for (const m of markets) {
        const [market] = await db
            .insert(predictionMarkets)
            .values({
                question: m.question.trim().slice(0, 200),
                description: m.description.trim().slice(0, 1000),
                category: m.category,
                creatorId: AI_CREATOR_ID,
                closesAt: new Date(Date.now() + m.closes_in_hours * 3600_000),
                feeBps: 500,
                resolutionSpec: m.resolution,
            })
            .returning();
        await db.insert(predictionOutcomes).values(
            m.outcomes.map((label, idx) => ({ marketId: market.id, idx, label: label.trim().slice(0, 60) })),
        );
        // Surface the new market in the /home coin alert rail.
        await emitPredictionEvent({
            marketId: market.id,
            question: market.question,
            category: market.category,
            creatorId: market.creatorId,
            occurredAt: market.createdAt,
        });
        created++;
    }
    return created;
}

/** One factory pass: resolve what's due, then top up the board. */
export async function runFactory(): Promise<{ resolved: number; skipped: number; created: number }> {
    const { resolved, skipped } = await autoResolveDueMarkets();

    const [{ open }] = await db
        .select({ open: sql<number>`count(*)::int` })
        .from(predictionMarkets)
        .where(and(eq(predictionMarkets.status, "open"), sql`${predictionMarkets.closesAt} > now()`));

    let created = 0;
    if (open < TARGET_OPEN_MARKETS) {
        const wanted = Math.min(TARGET_OPEN_MARKETS - open, MAX_GENERATED_PER_RUN);
        const generated = await generateMarkets(wanted);
        created = await insertGeneratedMarkets(generated);
    }
    return { resolved, skipped, created };
}
