import "server-only";
import { z } from "zod";
import { tool } from "ai";
import { and, count, eq, isNull, sum } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema/content/api-key";
import { developerApps } from "@/db/schema/content/developer-app";
import { developerWebhooks } from "@/db/schema/content/developer-webhook";
import { developerStreamRules } from "@/db/schema/content/developer-stream-rule";

// Read-only tools for the console agent, built PER REQUEST closed over the
// authenticated user id — so "read someone else's setup" isn't expressible
// (no id parameter to put another user in). The agent reads state and GUIDES;
// it never takes side-effectful actions itself (see the route's system prompt).
export function consoleAgentToolsFor(userId: string) {
    return {
        getMyConsoleState: tool({
            description:
                "The caller's own developer-platform state: how many API keys they have and their total balance, how many apps, whether a webhook endpoint is set and which events it's subscribed to, and how many streaming rules. Use this to answer 'what do I have', 'what's my setup', 'what should I do next', or to check a prerequisite before explaining a step.",
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
    };
}
