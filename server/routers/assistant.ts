import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "@/server/trpc";
import { redis } from "@/lib/cache";

// "ask watchparty" — the assistant behind the dock's star button
// (components/ai/ask-watchparty.tsx).
//
// Same Cloudflare Workers AI account API as the predictions factory
// (lib/predictions/factory.ts) and the discover rail's news card
// (server/routers/discover.ts:glmCryptoNews): one OpenAI-compatible endpoint on
// the account, no separate worker URL, model env-swappable. See the memory
// `glm-workers-ai` — there is no standalone GLM service to point at.
//
// This is the app's first STREAMING procedure. It's an async generator, which
// tRPC v11 flushes chunk-by-chunk over the `httpBatchStreamLink` the client is
// already configured with (lib/trpc/client.ts:40) — so no link, transport or
// route changes were needed to get token-by-token output.
//
// It degrades safely rather than depending on that: if a host ever buffers the
// response instead of flushing it, the client's `for await` still receives
// every chunk, just all at once. Nothing breaks, the text simply lands in one
// go — which is also exactly what happens when a proxy strips chunked encoding.

const ENDPOINT = (account: string) =>
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`;

// Model is env-swappable for the same reason as the other two GLM callers: the
// CF catalog moves faster than a deploy does.
const MODEL = () => process.env.ASSISTANT_MODEL ?? process.env.PREDICTIONS_FACTORY_MODEL ?? "@cf/zai-org/glm-5.2";

// Generous enough that a real conversation never hits it, tight enough that a
// stuck client can't run up the Workers AI bill. Per user, per rolling hour.
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 3600;

// The thread is client-held (the panel keeps it in component state), so the
// caller sends it back each turn. Capped on both axes: 20 turns of 4k chars is
// well inside the model's window and bounds what one request can cost.
const messageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
});

const chatInput = z.object({
    messages: z.array(messageSchema).min(1).max(20),
    // Current route, so answers can be about what the user is looking at.
    // Path only — never the query string, which carries ids and filters.
    path: z.string().max(200).optional(),
});

function systemPrompt(path: string | undefined) {
    return [
        "You are the in-app assistant for watchparty, a live-streaming and social app built on Solana where creators stream, post, and launch coins.",
        "What exists in the product, so you never invent surfaces: live streams and clips, a following/for-you feed, coins (every post or stream can have a token, and the first buyer is the launch), a trade page with charts and quick-buy, prediction markets, perps, creator subscriptions and platform premium tiers billed in USDC, quests and XP, direct messages, and communities.",
        "Answer as a knowledgeable product guide and crypto-literate assistant. Be concrete and brief — two or three short paragraphs at most, and a short list when the answer is genuinely a list.",
        "Never give financial advice, never predict a price, and never promise a coin will go up. If someone asks whether to buy something, explain how to evaluate it instead.",
        "If you do not know something about this specific app, say so plainly rather than guessing at a feature name or a menu path.",
        "Write in lowercase, in plain sentences. No emoji, no markdown headings, no bold.",
        path ? `The user is currently on the page ${path}.` : "",
    ]
        .filter(Boolean)
        .join(" ");
}

// Per-user hourly cap. Raw INCR/EXPIRE against the shared client, which is the
// pattern actually used in this repo (lib/security/audit-logger.ts,
// app/api/create-wallet/route.ts) — lib/rate-limit.ts is dead code and throws a
// bare Error that wouldn't map to a 429. Fails OPEN: Redis being down should
// not take the assistant down with it.
async function underRateLimit(userId: string) {
    try {
        const key = `ratelimit:assistant:${userId}`;
        const used = await redis.incr(key);
        if (used === 1) await redis.expire(key, RATE_WINDOW_SECONDS);
        return used <= RATE_LIMIT;
    } catch {
        return true;
    }
}

// Reads the OpenAI-compatible SSE body and yields content deltas.
//
// Line-buffered on purpose: a `data:` frame can be split across two network
// chunks, so only complete lines (up to a \n) are parsed and the remainder is
// carried forward. Parsing the raw chunk instead is the classic way to drop
// every token that happens to straddle a boundary.
async function* streamDeltas(res: Response): AsyncGenerator<string> {
    const body = res.body;
    if (!body) return;

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newline: number;
            while ((newline = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);

                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (payload === "[DONE]") return;

                try {
                    const frame = JSON.parse(payload) as {
                        choices?: { delta?: { content?: string } }[];
                    };
                    const delta = frame.choices?.[0]?.delta?.content;
                    if (delta) yield delta;
                } catch {
                    // Keepalive or a frame we don't recognise — skip it rather
                    // than failing the whole stream over one bad line.
                }
            }
        }
    } finally {
        // Consumer bailed (panel closed, navigation) — stop pulling from CF.
        await reader.cancel().catch(() => {});
    }
}

export const assistantRouter = router({
    chat: protectedProcedure.input(chatInput).mutation(async function* ({ ctx, input, signal }) {
        const account = process.env.CLOUDFLARE_ACCOUNT_ID;
        const token = process.env.CLOUDFLARE_API_TOKEN;
        if (!account || !token) {
            throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "the assistant isn't configured yet",
            });
        }

        if (!(await underRateLimit(ctx.user.id))) {
            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: "you've hit the hourly limit — try again in a bit",
            });
        }

        // Client disconnect OR a stuck upstream both abort the fetch. The
        // timeout is long because this is a streaming read, not a one-shot
        // call — the 6s used by the discover card would truncate real answers.
        const abort = signal
            ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
            : AbortSignal.timeout(45_000);

        const res = await fetch(ENDPOINT(account), {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({
                model: MODEL(),
                messages: [{ role: "system", content: systemPrompt(input.path) }, ...input.messages],
                stream: true,
                max_tokens: 900,
                temperature: 0.6,
            }),
            signal: abort,
        });

        if (!res.ok) {
            console.error("assistant.chat workers-ai failed:", res.status, (await res.text()).slice(0, 200));
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "the assistant is having a moment — try again",
            });
        }

        yield* streamDeltas(res);
    }),
});
