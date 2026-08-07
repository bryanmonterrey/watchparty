import { router, protectedProcedure } from "@/server/trpc";
import { getPremiumEntitlement } from "@/server/lib/premium-entitlement";
import { readAssistantUsage } from "@/server/lib/assistant-usage";

// Read-only companion to app/api/assistant/route.ts.
//
// The streaming itself is a Route Handler (the AI SDK's transport speaks HTTP,
// not tRPC), but everything ELSE about the assistant belongs on tRPC like the
// rest of the app — and the panel needs to render "N left" before the user
// sends anything, which a streaming endpoint can't tell it.
//
// Deliberately does not mutate: the quota is charged in the route, at the
// moment a message is actually sent. If this procedure spent anything, merely
// opening the panel would cost the user a message.

export const assistantRouter = router({
    quota: protectedProcedure.query(async ({ ctx }) => {
        const entitlement = await getPremiumEntitlement(ctx.user.id);
        const usage = await readAssistantUsage(ctx.user.id, entitlement);

        return {
            entitled: entitlement.entitled,
            tierKey: entitlement.tierKey,
            used: usage.messages,
            limit: usage.quota.messages,
            remaining: Math.max(0, usage.quota.messages - usage.messages),
            resetAt: usage.resetAt,
            // The token ceiling is a silent backstop, so it isn't surfaced as a
            // number — only as the fact that it has been hit, which the UI
            // needs in order to explain why sending is blocked.
            tokenCeilingHit: usage.tokens >= usage.quota.tokens,
            degraded: usage.degraded,
        };
    }),
});
