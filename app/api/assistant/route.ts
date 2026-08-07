import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    smoothStream,
    streamText,
    toUIMessageStream,
    type UIMessage,
} from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { redis } from "@/lib/cache";

// "ask watchparty" — the assistant behind the dock's star button
// (components/ai/ask-watchparty.tsx).
//
// Ported from vercel/ai-chatbot's route rather than hand-rolled: zod-validate →
// auth → rate limit → `createUIMessageStream` → merge `toUIMessageStream` →
// `createUIMessageStreamResponse`. Two API notes, because both of the shapes
// that show up in most examples are wrong for ai@7:
//   - `toDataStreamResponse()` was REMOVED (it's the v3/v4 name).
//   - `result.toUIMessageStreamResponse()` still exists but is DEPRECATED in
//     favour of the standalone helpers used here, and goes away next major.
//
// The model is Cloudflare Workers AI reached over its OpenAI-compatible
// endpoint — the same account API as the predictions factory
// (lib/predictions/factory.ts) and the discover news card
// (server/routers/discover.ts). See the memory `glm-workers-ai`: there is no
// standalone GLM service to point a provider at, which is why this is
// `@ai-sdk/openai-compatible` against the account URL rather than a first-party
// provider package. `workers-ai-provider` was the other option and was passed
// over — it wants a native `Ai` binding, which OpenNext doesn't give us here.

const ACCOUNT = () => process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = () => process.env.CLOUDFLARE_API_TOKEN;

// Env-swappable for the same reason as the other two GLM callers: the CF
// catalog moves faster than a deploy does.
const MODEL = () => process.env.ASSISTANT_MODEL ?? process.env.PREDICTIONS_FACTORY_MODEL ?? "@cf/zai-org/glm-5.2";

// Generous enough that a real conversation never notices, tight enough that a
// stuck client can't run up the Workers AI bill. Per user, per rolling hour.
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 3600;

const bodySchema = z.object({
    // `useChat` posts UIMessages (role + parts). Validated loosely on purpose —
    // the parts union is the SDK's to define, and `convertToModelMessages`
    // below is what actually has to understand it.
    messages: z.array(z.any()).min(1).max(40),
    // Current route, so answers can be about what the user is looking at. Path
    // only — never the query string, which carries ids and filters.
    path: z.string().max(200).optional(),
});

function systemPrompt(path: string | undefined) {
    return [
        "You are the in-app assistant for watchparty, a live-streaming and social app built on Solana where creators stream, post, and launch coins.",
        "What exists in the product, so you never invent surfaces: live streams and clips, a following/for-you feed, coins (every post or stream can have a token, and the first buyer is the launch), a trade page with charts and quick-buy, prediction markets, perps, creator subscriptions and platform premium tiers billed in USDC, quests and XP, direct messages, and communities.",
        "Answer as a knowledgeable product guide and crypto-literate assistant. Be concrete and brief — a few short paragraphs at most.",
        "You may use markdown: short lists, bold for emphasis, links, and code blocks when code is genuinely the answer. Do not use headings.",
        "Never give financial advice, never predict a price, and never promise a coin will go up. If someone asks whether to buy something, explain how to evaluate it instead.",
        "If you do not know something about this specific app, say so plainly rather than guessing at a feature name or a menu path.",
        "Write in lowercase, in plain sentences. No emoji.",
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

export async function POST(request: Request) {
    const account = ACCOUNT();
    const token = TOKEN();
    if (!account || !token) {
        return Response.json({ error: "the assistant isn't configured yet" }, { status: 503 });
    }

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
        return Response.json({ error: "you need to be signed in" }, { status: 401 });
    }

    let body: z.infer<typeof bodySchema>;
    try {
        body = bodySchema.parse(await request.json());
    } catch {
        return Response.json({ error: "bad request" }, { status: 400 });
    }

    if (!(await underRateLimit(session.user.id))) {
        return Response.json({ error: "you've hit the hourly limit — try again in a bit" }, { status: 429 });
    }

    const workersAI = createOpenAICompatible({
        name: "workers-ai",
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`,
        headers: { authorization: `Bearer ${token}` },
    });

    const uiMessages = body.messages as UIMessage[];

    const stream = createUIMessageStream({
        // async because `convertToModelMessages` returns a promise in ai@7 —
        // it resolves file/image parts, which most examples predate.
        execute: async ({ writer }) => {
            const result = streamText({
                model: workersAI(MODEL()),
                system: systemPrompt(body.path),
                messages: await convertToModelMessages(uiMessages),
                temperature: 0.6,
                maxOutputTokens: 900,
                // Chunk by word rather than by token. Raw token deltas arrive
                // in bursts that read as stuttering; this is the one piece of
                // "feel" the SDK gives for free, and every reference chat app
                // (ai-chatbot, chat-zeron, scira) turns it on.
                experimental_transform: smoothStream({ chunking: "word" }),
                abortSignal: request.signal,
            });

            // Standalone helper, not `result.toUIMessageStream()` — the method
            // carries the same "removed in the next major" deprecation as the
            // Response variant.
            writer.merge(toUIMessageStream({ stream: result.stream }));
        },
        // Never leak provider internals or keys to the client. The real error
        // is logged here and the user gets something they can act on.
        onError: (error) => {
            console.error("assistant stream failed:", error);
            return "the assistant is having a moment — try again";
        },
    });

    return createUIMessageStreamResponse({ stream });
}
