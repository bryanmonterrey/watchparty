import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { developerWebhookDeliveries, developerWebhooks } from "@/db/schema/content/developer-webhook";
import { randHex } from "@/lib/api-gate";
import { sendTestDelivery } from "@/lib/developer/webhooks";
import { WEBHOOK_EVENT_TYPES } from "@/lib/developer/webhook-events";
import { isAllowedWebhookUrl } from "@/lib/developer/webhook-url";
import { sealSecret } from "@/lib/developer/secret-box";
import { limitOrPass, webhookMutationLimiter, webhookTestLimiter } from "@/lib/rate-limit";

// One outbound webhook endpoint per account (the Discord app-webhook model:
// an endpoint + an event menu — see docs/console-discord-reference.md §6).
// Secret discipline matches API keys: plaintext exactly once at
// creation/reset, never re-displayed; reset is the only recovery.

const urlSchema = z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((u) => u.startsWith("https://"), { message: "Endpoint must be https" })
    .refine(isAllowedWebhookUrl, {
        message: "This host can't receive webhooks — use a public https endpoint you control",
    });

function newSecret(): string {
    return `whsec_${randHex(24)}`;
}

/** Per-user mutation throttle (fail-open — Redis being down never blocks). */
async function throttleMutation(userId: string): Promise<void> {
    if (!(await limitOrPass(webhookMutationLimiter, userId))) {
        throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many webhook changes — wait a minute and try again",
        });
    }
}

export const developerWebhooksRouter = router({
    /** Endpoint config for the console — everything except the secret. */
    get: protectedProcedure.query(async ({ ctx }) => {
        const [row] = await db
            .select({
                url: developerWebhooks.url,
                events: developerWebhooks.events,
                enabled: developerWebhooks.enabled,
                createdAt: developerWebhooks.createdAt,
            })
            .from(developerWebhooks)
            .where(eq(developerWebhooks.userId, ctx.user.id))
            .limit(1);
        return row ?? null;
    }),

    /** Create the endpoint (returns the signing secret — shown once). */
    create: protectedProcedure
        .input(z.object({ url: urlSchema }))
        .mutation(async ({ ctx, input }) => {
            if (!process.env.API_GATE_SECRET) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Webhooks are not enabled on this deployment",
                });
            }
            await throttleMutation(ctx.user.id);
            const secret = newSecret();
            const inserted = await db
                .insert(developerWebhooks)
                .values({ userId: ctx.user.id, url: input.url, secret: await sealSecret(secret) })
                .onConflictDoNothing()
                .returning({ userId: developerWebhooks.userId });
            if (!inserted.length) {
                throw new TRPCError({
                    code: "CONFLICT",
                    message: "You already have a webhook endpoint — update it instead",
                });
            }
            return { secret };
        }),

    /** Change the endpoint URL (secret unchanged). */
    setUrl: protectedProcedure
        .input(z.object({ url: urlSchema }))
        .mutation(async ({ ctx, input }) => {
            await throttleMutation(ctx.user.id);
            const updated = await db
                .update(developerWebhooks)
                .set({ url: input.url, updatedAt: new Date() })
                .where(eq(developerWebhooks.userId, ctx.user.id))
                .returning({ userId: developerWebhooks.userId });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
            return { success: true };
        }),

    /** Roll the signing secret (returns the new one — shown once). */
    resetSecret: protectedProcedure.mutation(async ({ ctx }) => {
        await throttleMutation(ctx.user.id);
        const secret = newSecret();
        const updated = await db
            .update(developerWebhooks)
            .set({ secret: await sealSecret(secret), updatedAt: new Date() })
            .where(eq(developerWebhooks.userId, ctx.user.id))
            .returning({ userId: developerWebhooks.userId });
        if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
        return { secret };
    }),

    /** The Events card's master toggle. */
    setEnabled: protectedProcedure
        .input(z.object({ enabled: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
            await throttleMutation(ctx.user.id);
            const updated = await db
                .update(developerWebhooks)
                .set({ enabled: input.enabled, updatedAt: new Date() })
                .where(eq(developerWebhooks.userId, ctx.user.id))
                .returning({ userId: developerWebhooks.userId });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
            return { success: true };
        }),

    /** Replace the subscribed event set (validated against the catalog). */
    setEvents: protectedProcedure
        .input(z.object({ events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).max(32) }))
        .mutation(async ({ ctx, input }) => {
            await throttleMutation(ctx.user.id);
            const updated = await db
                .update(developerWebhooks)
                .set({ events: [...new Set(input.events)], updatedAt: new Date() })
                .where(eq(developerWebhooks.userId, ctx.user.id))
                .returning({ userId: developerWebhooks.userId });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
            return { success: true };
        }),

    /** Delete the endpoint (and its delivery history stays until pruned). */
    remove: protectedProcedure.mutation(async ({ ctx }) => {
        await db.delete(developerWebhooks).where(eq(developerWebhooks.userId, ctx.user.id));
        return { success: true };
    }),

    /** Deliver a signed webhook.test to the configured endpoint, now. */
    sendTest: protectedProcedure.mutation(async ({ ctx }) => {
        if (!(await limitOrPass(webhookTestLimiter, ctx.user.id))) {
            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: "Wait a moment between test deliveries",
            });
        }
        const result = await sendTestDelivery(ctx.user.id);
        if (!result) {
            throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: "No enabled webhook endpoint to test",
            });
        }
        return result;
    }),

    /** Recent deliveries for the console's log (metadata only). */
    deliveries: protectedProcedure.query(async ({ ctx }) => {
        return db
            .select({
                id: developerWebhookDeliveries.id,
                event: developerWebhookDeliveries.event,
                status: developerWebhookDeliveries.status,
                ok: developerWebhookDeliveries.ok,
                durationMs: developerWebhookDeliveries.durationMs,
                createdAt: developerWebhookDeliveries.createdAt,
            })
            .from(developerWebhookDeliveries)
            .where(eq(developerWebhookDeliveries.userId, ctx.user.id))
            .orderBy(desc(developerWebhookDeliveries.createdAt))
            .limit(20);
    }),
});
