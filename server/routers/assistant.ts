import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { assistantThreads, assistantMessages } from "@/db/schema/content";
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

    // The history dialog's list. Titles and timestamps only — replaying the
    // messages is a second call, because the dialog shows ~50 threads and
    // shipping every message body for all of them would be most of a session's
    // transcript to render one line each.
    threads: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
        .query(async ({ ctx, input }) => {
            return db
                .select({
                    id: assistantThreads.id,
                    title: assistantThreads.title,
                    updatedAt: assistantThreads.updatedAt,
                })
                .from(assistantThreads)
                .where(eq(assistantThreads.userId, ctx.user.id))
                .orderBy(desc(assistantThreads.updatedAt))
                .limit(input?.limit ?? 50);
        }),

    // One thread, replayed in order.
    thread: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            // Ownership is checked on the THREAD before any message is read.
            // RLS also covers this, but the app connects as the table owner on
            // some paths, so the explicit filter is the real gate — an
            // assistant thread can contain wallet balances and portfolio
            // questions.
            const [thread] = await db
                .select()
                .from(assistantThreads)
                .where(and(eq(assistantThreads.id, input.id), eq(assistantThreads.userId, ctx.user.id)))
                .limit(1);

            if (!thread) throw new TRPCError({ code: "NOT_FOUND" });

            const rows = await db
                .select({
                    id: assistantMessages.id,
                    role: assistantMessages.role,
                    parts: assistantMessages.parts,
                })
                .from(assistantMessages)
                .where(eq(assistantMessages.threadId, input.id))
                .orderBy(assistantMessages.createdAt);

            return { id: thread.id, title: thread.title, messages: rows };
        }),

    deleteThread: protectedProcedure
        .input(z.object({ id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            // The userId term is what makes this safe — without it any known
            // thread id would be deletable by anyone. Messages go with it via
            // ON DELETE CASCADE.
            await db
                .delete(assistantThreads)
                .where(and(eq(assistantThreads.id, input.id), eq(assistantThreads.userId, ctx.user.id)));
            return { ok: true };
        }),
});
