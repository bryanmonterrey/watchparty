import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { smoothStream, stepCountIs, streamText } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { consoleAgentToolsFor } from "@/server/lib/console-agent-tools";
import { limitOrPass, apiLimiter } from "@/lib/rate-limit";

// The developer-console Agent (console.watchparty.xyz Agent page). Reuses the
// same Cloudflare Workers AI / GLM plumbing as app/api/assistant, but with
// console-specific read tools and a system prompt that GUIDES rather than acts:
// this route has NO write tools, so the agent can explain and check state but
// cannot create keys/webhooks itself — side-effectful actions stay on their
// pages behind the user's own click (the safety rule for irreversible actions).
//
// Returns a PLAIN TEXT stream (result.textStream), so the console needs no
// AI-SDK client deps — it reads the body as text and appends. GLM-5.2 is a
// reasoning model, so the same maxOutputTokens:6000 as the assistant (a smaller
// budget was the "empty reply" bug — the reasoning ate the whole allowance).

const ACCOUNT = () => process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = () => process.env.CLOUDFLARE_API_TOKEN;
const MODEL = () => process.env.ASSISTANT_MODEL ?? process.env.PREDICTIONS_FACTORY_MODEL ?? "@cf/zai-org/glm-5.2";

const bodySchema = z.object({
    messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
    })).min(1).max(30),
});

const SYSTEM = [
    "You are the Agent in the watchparty developer console — a concise, technically precise guide to the platform's API and this console.",
    "What the console has, so you never invent surfaces: Dashboard, API Keys (created here, sent as the x-api-key header, funded with USDC credits, restrictable to scopes: coins/content/social/charts/rpc/preview/rest), Apps (each with an Ed25519 signing identity), Webhooks (one signed endpoint per account, subscribe to events: stream.online/offline, user.followed, coin.launched, prediction.resolved), Event subscriptions, Streaming rules (per-app filter rules; matching engine is in preview), Connections, Usage, Credits, Payments, Billing.",
    "The API: same base the app runs on, billed per request for external callers. Two ways to pay — a funded API key (x-api-key), or x402 per-request USDC with no account. Reads are priced per surface from $0.001. Full docs at docs.watchparty.xyz.",
    "Use the getMyConsoleState tool whenever the question is about the caller's own setup ('what do I have', 'what should I do next', 'is my webhook configured') — do not guess their state.",
    "IMPORTANT: you cannot take actions. You have no tools that create keys, apps, webhooks, or rules. When the user wants to DO something, walk them through it and point at the exact page (e.g. 'open Keys and click Create key', 'on Webhooks, add your https endpoint then subscribe to coin.launched'). Never say you have done something, and never claim an action is complete.",
    "Be brief and concrete — a few short sentences. Use markdown sparingly (a short list or inline code). No headings, no emoji, plain capitalisation. If you don't know something specific to this platform, say so rather than inventing a menu path.",
].join(" ");

export async function POST(request: Request) {
    const account = ACCOUNT();
    const token = TOKEN();
    if (!account || !token) {
        return Response.json({ error: "the agent isn't configured yet" }, { status: 503 });
    }

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
        return Response.json({ error: "sign in to use the agent" }, { status: 401 });
    }

    if (!(await limitOrPass(apiLimiter, `console-agent:${session.user.id}`))) {
        return Response.json({ error: "slow down a moment" }, { status: 429 });
    }

    let body: z.infer<typeof bodySchema>;
    try {
        body = bodySchema.parse(await request.json());
    } catch {
        return Response.json({ error: "bad request" }, { status: 400 });
    }

    const workersAI = createOpenAICompatible({
        name: "workers-ai",
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`,
        headers: { authorization: `Bearer ${token}` },
    });

    const result = streamText({
        model: workersAI(MODEL()),
        system: SYSTEM,
        messages: body.messages,
        temperature: 0.4,
        maxOutputTokens: 6000,
        tools: consoleAgentToolsFor(session.user.id),
        stopWhen: stepCountIs(4),
        experimental_transform: smoothStream({ chunking: "word" }),
        abortSignal: request.signal,
    });

    // Plain UTF-8 text stream — the console reads response.body as text.
    return new Response(result.textStream.pipeThrough(new TextEncoderStream()), {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
}
