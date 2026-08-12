import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { smoothStream, stepCountIs, streamText } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { consoleAgentToolsFor } from "@/server/lib/console-agent-tools";
import { persistAssistantTurnSafely } from "@/server/lib/assistant-threads";
import { limitOrPass, apiLimiter } from "@/lib/rate-limit";
import type { Context } from "@/server/trpc";

// The developer-console Agent (console.watchparty.xyz/agent). Same Cloudflare
// Workers AI / GLM plumbing as app/api/assistant, but with the console tool
// set — reads AND bounded writes: the agent can create apps/keys, configure
// the webhook, add streaming rules and enable OAuth sign-in, each through a
// server-side tRPC caller so every ownership check, cap and throttle the
// console UI pays applies identically. No delete/rotate/fund tools exist —
// destructive or value-moving actions stay on their pages behind the user's
// own click.
//
// Protocol: NDJSON over a text stream (the console app deliberately carries
// no AI-SDK client deps). One JSON object per line:
//   {t:"delta", v:string}                  streamed answer text
//   {t:"tool", name}                       a tool started
//   {t:"toolResult", name, v:object}       its result — UNREDACTED, because
//                                          view-once secrets (API keys, OAuth
//                                          client secrets) must reach the user
//   {t:"toolError", name, v:string}
//   {t:"done", threadId}                   turn persisted
//   {t:"error", v:string}
//
// Persistence rides the assistant_threads stack with surface:'console'
// (client-generated thread uuid, same contract as the ask panel). Tool
// results are REDACTED before they're stored — a plaintext API key in a chat
// row would defeat the platform's hashed-at-rest storage; the stream is the
// view-once panel.
//
// GLM-5.2 is a reasoning model: maxOutputTokens must stay generous (a small
// budget was the "empty reply" bug — reasoning ate the whole allowance).

const ACCOUNT = () => process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = () => process.env.CLOUDFLARE_API_TOKEN;
const MODEL = () => process.env.ASSISTANT_MODEL ?? process.env.PREDICTIONS_FACTORY_MODEL ?? "@cf/zai-org/glm-5.2";

const bodySchema = z.object({
    threadId: z.string().uuid(),
    messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
    })).min(1).max(30),
});

const SYSTEM = [
    "You are the Agent in the watchparty developer console — a concise, technically precise operator who can READ the caller's setup and SET THINGS UP for them.",
    "What the console has, so you never invent surfaces: Dashboard, API Keys (sent as the x-api-key header, funded with USDC credits, restrictable to scopes: coins/content/social/charts/rpc/preview/rest), Apps (each with an Ed25519 signing identity), Webhooks (one signed endpoint per account; events: stream.online/offline, user.followed, coin.launched, prediction.resolved), Event subscriptions, Streaming rules, Connections, Usage, Credits, Payments, Billing.",
    "The API: same base the app runs on, billed per request for external callers. Two ways to pay — a funded API key (x-api-key), or x402 per-request USDC with no account. Reads are priced per surface from $0.001. Full docs at docs.watchparty.xyz.",
    "Use the read tools before acting or answering about state, never guess: getMyConsoleState (counts + webhook), listMyApps (resolve an appId), getMyApiKeys (per-key USDC balance / spent / last used — for funding questions and 402 debugging), getRecentWebhookDeliveries (last ~20 attempts with ok/status/duration — for 'my webhook isn't firing').",
    "ACTING: you have tools that create apps, create API keys, set up the webhook endpoint and its events, add streaming rules, and enable Sign in with watchparty. Use them when the user asks you to set something up. If a required parameter is genuinely ambiguous (which app, which URL), ask one short question instead of inventing it; sensible defaults (a key name like 'default', all scopes) don't need asking.",
    "After a tool runs, state exactly what happened using the tool's real output — ids, names, where to see it. Secrets (API keys, webhook signing secrets, OAuth client secrets) are shown ONCE and not stored anywhere: tell the user to copy them now, but NEVER write the secret's value in your own text — the console displays it from the tool result, and your text is persisted while secrets must not be.",
    "You CANNOT delete, rotate, revoke, or fund anything — those stay on their console pages; point at the exact page when asked ('open Keys and use Revoke').",
    "If a tool returns an error field, relay the reason plainly and suggest the fix. Never say you did something a tool didn't confirm.",
    "Be brief and concrete — a few short sentences. Light markdown renders in the console: **bold**, `inline code`, fenced code blocks, and - bullet lists are fine and encouraged for keys/URLs/steps. No headings, no tables, no emoji, plain capitalisation.",
].join(" ");

/** Deep-copy a tool output with view-once credential fields blanked — what
 *  gets PERSISTED. Field-name based on purpose: every secret-bearing tool
 *  returns them as `key`, `secret`, or `clientSecret`. */
function redactSecrets(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactSecrets);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = /^(key|secret|clientSecret)$/.test(k) && typeof v === "string"
                ? "shown once — not stored"
                : redactSecrets(v);
        }
        return out;
    }
    return value;
}

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

    // A real tRPC context (same shape createContext builds) so the caller-based
    // write tools run with exactly the HTTP surface's guards.
    const ctx: Context = {
        session,
        user: session.user,
        headers: new Headers(request.headers),
        bot: null,
    };

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
        tools: consoleAgentToolsFor(ctx),
        stopWhen: stepCountIs(6),
        experimental_transform: smoothStream({ chunking: "word" }),
        abortSignal: request.signal,
    });

    const { threadId, messages } = body;
    const userId = session.user.id;

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const enc = new TextEncoder();
            const emit = (obj: Record<string, unknown>) =>
                controller.enqueue(enc.encode(`${JSON.stringify(obj)}\n`));

            let text = "";
            // Redacted tool activity, in order — persisted so a reloaded
            // thread still shows what was set up.
            const toolParts: { type: "data-toolActivity"; data: { name: string; output?: unknown; error?: string } }[] = [];

            try {
                for await (const part of result.fullStream) {
                    if (part.type === "text-delta") {
                        text += part.text;
                        emit({ t: "delta", v: part.text });
                    } else if (part.type === "tool-call") {
                        emit({ t: "tool", name: part.toolName });
                    } else if (part.type === "tool-result") {
                        emit({ t: "toolResult", name: part.toolName, v: part.output });
                        toolParts.push({
                            type: "data-toolActivity",
                            data: { name: part.toolName, output: redactSecrets(part.output) },
                        });
                    } else if (part.type === "tool-error") {
                        emit({ t: "toolError", name: part.toolName, v: String(part.error) });
                        toolParts.push({
                            type: "data-toolActivity",
                            data: { name: part.toolName, error: String(part.error) },
                        });
                    } else if (part.type === "error") {
                        emit({ t: "error", v: "the model hit an error — try again" });
                    }
                }

                if (text.trim() || toolParts.length) {
                    const incoming = messages.map((m, i) => ({
                        id: `m${i}`,
                        role: m.role,
                        parts: [{ type: "text" as const, text: m.content }],
                    })) as UIMessage[];
                    const responseMessage = {
                        id: "response",
                        role: "assistant",
                        parts: [
                            ...(text.trim() ? [{ type: "text" as const, text }] : []),
                            ...toolParts,
                        ],
                    } as unknown as UIMessage;
                    await persistAssistantTurnSafely({
                        userId,
                        threadId,
                        incoming,
                        responseMessage,
                        surface: "console",
                    });
                }

                emit({ t: "done", threadId });
            } catch (err) {
                console.error("console-agent stream failed:", err, (err as Error)?.cause);
                emit({ t: "error", v: "something went wrong — try again" });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
    });
}
