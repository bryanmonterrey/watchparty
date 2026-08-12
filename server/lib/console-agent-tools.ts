import "server-only";
import { z } from "zod";
import { tool } from "ai";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull, sum } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema/content/api-key";
import { developerApps } from "@/db/schema/content/developer-app";
import { developerWebhooks } from "@/db/schema/content/developer-webhook";
import { developerStreamRules } from "@/db/schema/content/developer-stream-rule";
import { API_SCOPES } from "@/lib/api-pricing";
import { WEBHOOK_EVENT_TYPES } from "@/lib/developer/webhook-events";
import { appRouter } from "@/server/routers";
import { createCallerFactory, type Context } from "@/server/trpc";

// Tools for the console Agent, built PER REQUEST closed over the caller's
// authenticated tRPC context — so "touch someone else's setup" isn't
// expressible (no id parameter can name another user; every write goes
// through the SAME procedures the console UI calls, with their ownership
// checks, caps and throttles riding along via a server-side caller).
//
// Write policy (the X-console-agent model, bounded): the agent may CREATE and
// CONFIGURE — apps, keys, webhook endpoint + events, streaming rules, the
// OAuth client. It has NO delete, NO rotate, NO fund/spend tools: everything
// it does is undoable from the console pages, and anything that destroys or
// moves value stays behind the user's own click.
//
// TRPCErrors are caught and returned as { error } so the model can relay the
// real reason ("you're at the 25-app limit") instead of the stream dying.

const caught = async <T>(run: () => Promise<T>): Promise<T | { error: string }> => {
    try {
        return await run();
    } catch (err) {
        if (err instanceof TRPCError) return { error: err.message };
        throw err;
    }
};

export function consoleAgentToolsFor(ctx: Context) {
    if (!ctx.user) throw new Error("console agent tools require an authenticated context");
    const userId = ctx.user.id;
    const caller = createCallerFactory(appRouter)(ctx);

    return {
        getMyConsoleState: tool({
            description:
                "The caller's own developer-platform state: how many API keys they have and their total balance, how many apps, whether a webhook endpoint is set and which events it's subscribed to, and how many streaming rules. Use this to answer 'what do I have', 'what should I do next', or to check a prerequisite before acting.",
            inputSchema: z.object({}),
            execute: async () => {
                const [keyAgg, appAgg, ruleAgg, [hook]] = await Promise.all([
                    db.select({ n: count(), bal: sum(apiKeys.balanceMicro) })
                        .from(apiKeys)
                        .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt))),
                    db.select({ n: count() })
                        .from(developerApps)
                        .where(and(eq(developerApps.ownerId, userId), isNull(developerApps.deletedAt))),
                    db.select({ n: count() })
                        .from(developerStreamRules)
                        .where(eq(developerStreamRules.userId, userId)),
                    db.select({ url: developerWebhooks.url, events: developerWebhooks.events, enabled: developerWebhooks.enabled })
                        .from(developerWebhooks)
                        .where(eq(developerWebhooks.userId, userId))
                        .limit(1),
                ]);
                return {
                    activeKeys: keyAgg[0]?.n ?? 0,
                    totalBalanceUsd: Number(keyAgg[0]?.bal ?? 0) / 1_000_000,
                    apps: appAgg[0]?.n ?? 0,
                    streamingRules: ruleAgg[0]?.n ?? 0,
                    webhook: hook
                        ? { configured: true, enabled: hook.enabled, subscribedEvents: hook.events }
                        : { configured: false },
                };
            },
        }),

        listMyApps: tool({
            description:
                "The caller's apps (id, name, whether OAuth sign-in is enabled). Use it to resolve which appId a request refers to before creating keys, rules, or an OAuth client for it — never guess an appId.",
            inputSchema: z.object({}),
            execute: async () => {
                const rows = await db
                    .select({
                        id: developerApps.id,
                        name: developerApps.name,
                        oauthClientId: developerApps.oauthClientId,
                    })
                    .from(developerApps)
                    .where(and(eq(developerApps.ownerId, userId), isNull(developerApps.deletedAt)))
                    .orderBy(desc(developerApps.createdAt));
                return rows.map((r) => ({ id: r.id, name: r.name, oauthEnabled: !!r.oauthClientId }));
            },
        }),

        createApp: tool({
            description:
                "Create a developer app (a home for keys/webhooks with an Ed25519 signing identity). Returns the new app id. 25-app cap is enforced.",
            inputSchema: z.object({
                name: z.string().trim().min(1).max(64),
                description: z.string().trim().max(400).optional(),
            }),
            execute: ({ name, description }) =>
                caught(async () => {
                    const { id } = await caller.developerApps.create({ name, description });
                    return { id, name, next: "Visible on the Apps page." };
                }),
        }),

        createApiKey: tool({
            description:
                "Create an API key (sent as the x-api-key header, funded with USDC credits). Optionally scope it to surface families and/or file it under one of the caller's apps. The returned `key` is shown ONCE and never stored — tell the user to save it now. New keys have zero credits until funded on the Credits page.",
            inputSchema: z.object({
                name: z.string().trim().min(1).max(64),
                appId: z.string().optional(),
                scopes: z.array(z.enum(API_SCOPES)).optional(),
            }),
            execute: (input) =>
                caught(async () => {
                    const { id, key } = await caller.apiKeys.create(input);
                    return { id, key, shownOnce: true, next: "Fund it with credits before calling the API." };
                }),
        }),

        setupWebhook: tool({
            description:
                "Create the account's webhook endpoint (one per account — signed HTTP callbacks). Returns the signing secret ONCE. If an endpoint already exists this fails with a clear error — use setWebhookEvents to change subscriptions, or tell the user to edit the URL on the Webhooks page.",
            inputSchema: z.object({
                url: z.string().url().max(2048),
            }),
            execute: ({ url }) =>
                caught(async () => {
                    const { secret } = await caller.developerWebhooks.create({ url });
                    return { url, secret, shownOnce: true, next: "Subscribe it to events with setWebhookEvents." };
                }),
        }),

        setWebhookEvents: tool({
            description:
                `Replace the webhook endpoint's event subscriptions (the FULL list — include existing events to keep them). Valid events: ${WEBHOOK_EVENT_TYPES.join(", ")}. Fails if no endpoint is configured yet.`,
            inputSchema: z.object({
                events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).max(32),
            }),
            execute: ({ events }) =>
                caught(async () => {
                    await caller.developerWebhooks.setEvents({ events });
                    return { subscribedEvents: events };
                }),
        }),

        addStreamingRules: tool({
            description:
                "Add filtered-stream rules to one of the caller's apps (X-style grammar: space-separated AND terms, `-` negation, `field:value` operators, at least one positive term required). Matches deliver on GET /api/stream/events.",
            inputSchema: z.object({
                appId: z.string(),
                rules: z.array(z.object({
                    value: z.string().trim().min(1).max(1024),
                    tag: z.string().trim().max(128).optional(),
                })).min(1).max(25),
            }),
            execute: (input) =>
                caught(async () => {
                    const result = await caller.developerStreamRules.add(input);
                    return { added: input.rules.length, result };
                }),
        }),

        enableSignInWithWatchparty: tool({
            description:
                "Enable 'Sign in with watchparty' (OAuth2 + PKCE) for one of the caller's apps by creating its OAuth client. type 'web' = confidential server-side client (gets a secret, shown ONCE); 'public' = native/mobile PKCE-only (no secret). Redirect URIs must be https (http only for localhost; custom schemes allowed for public clients). Fails if the app already has a client.",
            inputSchema: z.object({
                appId: z.string(),
                redirectUris: z.array(z.string().min(1).max(2048)).min(1).max(10),
                type: z.enum(["web", "public"]).default("web"),
            }),
            execute: ({ appId, redirectUris, type }) =>
                caught(async () => {
                    const result = await caller.developerApps.createOAuthClient({ id: appId, redirectUris, type });
                    return {
                        clientId: result.clientId,
                        clientSecret: result.clientSecret,
                        type: result.type,
                        shownOnce: result.clientSecret ? true : undefined,
                        next: "Send users to /api/auth/oauth2/authorize — full flow in the docs.",
                    };
                }),
        }),
    };
}
