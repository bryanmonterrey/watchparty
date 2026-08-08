import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    smoothStream,
    stepCountIs,
    streamText,
    toUIMessageStream,
    type UIMessage,
} from "ai";
import { assistantTools } from "@/server/lib/assistant-tools";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { getPremiumEntitlement } from "@/server/lib/premium-entitlement";
import {
    recordAssistantTokens,
    refundAssistantMessage,
    spendAssistantMessage,
} from "@/server/lib/assistant-usage";

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

const bodySchema = z.object({
    // `useChat` posts UIMessages (role + parts). Validated loosely on purpose —
    // the parts union is the SDK's to define, and `convertToModelMessages`
    // below is what actually has to understand it.
    messages: z.array(z.any()).min(1).max(40),
    // Current route, so answers can be about what the user is looking at. Path
    // only — never the query string, which carries ids and filters.
    path: z.string().max(200).optional(),
    // The wallet picked in the composer, by NAME. Deliberately not an address:
    // the model has no use for base58, and the app-wide rule is that addresses
    // aren't display data. Untrusted (it's a user-supplied label), so it's
    // length-capped and only ever quoted back, never used to look anything up.
    wallet: z.string().max(64).optional(),
});

function systemPrompt(path: string | undefined, wallet: string | undefined) {
    return [
        "You are the in-app assistant for watchparty, a live-streaming and social app built on Solana where creators stream, post, and launch coins.",
        "What exists in the product, so you never invent surfaces: live streams and clips, a following/for-you feed, coins (every post or stream can have a token, and the first buyer is the launch), a trade page with charts and quick-buy, prediction markets, perps, creator subscriptions and platform premium tiers billed in USDC, quests and XP, direct messages, and communities.",
        "Answer as a knowledgeable product guide and crypto-literate assistant. Be concrete and brief — a few short paragraphs at most.",
        "You have tools that read live data: getHotCoins (watchparty coins moving now), lookupCoin (one coin by ticker or name), getLiveStreams (who is streaming), getMarketTrending (the wider multi-chain market). USE THEM whenever the question is about what is happening right now, or names a specific coin — do not answer those from memory, and never invent a price, a ticker, or a viewer count.",
        "When a tool returns nothing, say so plainly ('no one's live right now', 'I can't find that coin') instead of filling the gap. Prices move, so mention that a number is a snapshot rather than presenting it as fixed.",
        "You may use markdown: short lists, bold for emphasis, links, and code blocks when code is genuinely the answer. Do not use headings.",
        "Never give financial advice, never predict a price, and never promise a coin will go up. If someone asks whether to buy something, explain how to evaluate it instead.",
        "If you do not know something about this specific app, say so plainly rather than guessing at a feature name or a menu path.",
        "Write in lowercase, in plain sentences. No emoji.",
        path ? `The user is currently on the page ${path}.` : "",
        // Quoted back so answers name the right wallet. It grants NOTHING —
        // there are no wallet tools yet, and when there are, authority will
        // come from a capped grant on the connector credential, never from a
        // label the client sent in a request body.
        wallet ? `Their selected wallet is called "${wallet}". Refer to it by that name; you cannot see its balance or move funds.` : "",
    ]
        .filter(Boolean)
        .join(" ");
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

    // Entitlement first, then quota. Free accounts aren't blocked outright —
    // they get FREE_QUOTA, so someone can find out whether this is worth
    // paying for. Running out is what surfaces the upgrade overlay.
    //
    // This is a Postgres read, so unlike the Redis quota below it fails CLOSED:
    // if the DB is down nobody streams, which is correct for a paid gate.
    const entitlement = await getPremiumEntitlement(session.user.id);
    const spend = await spendAssistantMessage(session.user.id, entitlement);

    if (!spend.allowed) {
        // 402 is the client's cue to open the upgrade overlay (see the custom
        // fetch in components/ai/ask-surface.tsx). `upgrade` is false for users
        // who already pay — they've hit their tier's ceiling, and showing them
        // a "subscribe" sheet they're already inside of would be nonsense.
        return Response.json(
            {
                error: entitlement.entitled
                    ? `you've used your ${entitlement.tierKey} ai allowance for this billing period`
                    : "you've used today's free ai messages — upgrade for more",
                code: spend.reason === "tokens" ? "token_ceiling" : "quota_exhausted",
                upgrade: !entitlement.entitled,
                resetAt: spend.resetAt.toISOString(),
            },
            { status: 402 },
        );
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
                system: systemPrompt(body.path, body.wallet),
                messages: await convertToModelMessages(uiMessages),
                temperature: 0.6,
                // GLM-5.2 IS A REASONING MODEL. It streams its chain of thought
                // as `reasoning_content` deltas and the actual answer as
                // `content` deltas — and the budget is shared. Measured against
                // the live endpoint: "say hello in 3 words" spends 861 chars of
                // reasoning and 278 completion tokens; a one-sentence product
                // question streams 709 reasoning deltas before the first of 44
                // content deltas.
                //
                // At the 900 this used to be, the stream was cut off mid-
                // reasoning and produced ZERO content deltas, so every reply
                // rendered as an empty message. That was the "text doesn't show
                // up in the chat" bug — not a UI fault at all.
                //
                // 6000 leaves room for reasoning plus a real answer. It is a
                // ceiling, not a target: `usage.totalTokens` (which includes
                // reasoning) is what the token quota bills, so ordinary replies
                // still cost what they cost.
                maxOutputTokens: 6000,
                tools: assistantTools,
                // Enough for look-up → answer, or two look-ups → answer.
                // Unbounded stepping is how one message quietly becomes a
                // dozen model round-trips against a metered account.
                stopWhen: stepCountIs(4),
                // Chunk by word rather than by token. Raw token deltas arrive
                // in bursts that read as stuttering; this is the one piece of
                // "feel" the SDK gives for free, and every reference chat app
                // (ai-chatbot, chat-zeron, scira) turns it on.
                experimental_transform: smoothStream({ chunking: "word" }),
                abortSignal: request.signal,
                // Real cost, charged after the fact — the message counter is
                // what gates, this is the backstop that notices when a small
                // number of messages is actually a large amount of spend.
                // `totalTokens` covers prompt + completion, so long histories
                // are priced honestly rather than counted as one cheap turn.
                //
                // `usage`, not `totalUsage` — the latter is @deprecated on this
                // event ("Use `usage` instead"), same as every other `result.*`
                // convenience in ai@7. Both compile, so only the .d.ts tells you.
                onFinish: ({ usage }) => {
                    const spent = usage?.totalTokens;
                    if (typeof spent === "number") {
                        void recordAssistantTokens(session.user.id, entitlement, spent);
                    }
                },
            });

            // Standalone helper, not `result.toUIMessageStream()` — the method
            // carries the same "removed in the next major" deprecation as the
            // Response variant.
            writer.merge(toUIMessageStream({ stream: result.stream }));
        },
        // Never leak provider internals or keys to the client. The real error
        // is logged here and the user gets something they can act on.
        //
        // Also refunds the message: it was charged before the stream started,
        // and a failure here means no answer was delivered. Aborts don't come
        // through this path, so stopping a reply you asked for still costs.
        onError: (error) => {
            console.error("assistant stream failed:", error);
            void refundAssistantMessage(session.user.id, entitlement);
            return "the assistant is having a moment — try again";
        },
    });

    return createUIMessageStreamResponse({ stream });
}
