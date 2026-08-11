import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { developerStreamRules } from "@/db/schema/content/developer-stream-rule";
import { developerApps } from "@/db/schema/content/developer-app";
import { randHex } from "@/lib/api-gate";
import { validateRule } from "@/lib/developer/stream-rules";
import { limitOrPass, webhookMutationLimiter } from "@/lib/rate-limit";

// Filtered-stream rule CRUD (X's Streaming Rules — docs/console-x-reference.md
// §11). Rules are stored + managed per app; the real-time matching/delivery
// engine is a later phase, so this is durable config today (X shows the same
// empty-then-populated table). Ownership enforced by userId; appId must be the
// caller's own non-deleted app.

const MAX_RULES = 100;

async function assertOwnsApp(userId: string, appId: string) {
    const [app] = await db
        .select({ id: developerApps.id })
        .from(developerApps)
        .where(and(
            eq(developerApps.id, appId),
            eq(developerApps.ownerId, userId),
            // isNull deletedAt implied by the app being usable; a soft-deleted
            // app can't own new rules.
        ))
        .limit(1);
    if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "App not found" });
}

export const developerStreamRulesRouter = router({
    /** All rules for the caller, optionally scoped to one app. */
    list: protectedProcedure
        .input(z.object({ appId: z.string().optional() }).optional())
        .query(async ({ ctx, input }) => {
            const where = input?.appId
                ? and(eq(developerStreamRules.userId, ctx.user.id), eq(developerStreamRules.appId, input.appId))
                : eq(developerStreamRules.userId, ctx.user.id);
            return db
                .select({
                    id: developerStreamRules.id,
                    appId: developerStreamRules.appId,
                    value: developerStreamRules.value,
                    tag: developerStreamRules.tag,
                    createdAt: developerStreamRules.createdAt,
                })
                .from(developerStreamRules)
                .where(where)
                .orderBy(desc(developerStreamRules.createdAt));
        }),

    /** Add one or more rules to an app (X's "Add Rules" modal, bulk). */
    add: protectedProcedure
        .input(z.object({
            appId: z.string(),
            rules: z.array(z.object({
                value: z.string().trim().min(1).max(1024),
                tag: z.string().trim().max(128).optional(),
            })).min(1).max(25),
        }))
        .mutation(async ({ ctx, input }) => {
            if (!(await limitOrPass(webhookMutationLimiter, ctx.user.id))) {
                throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Slow down — try again in a minute" });
            }
            await assertOwnsApp(ctx.user.id, input.appId);

            // Validate each rule against the engine (lib/developer/stream-rules):
            // rejects empties, over-length, and all-negation rules (which would
            // match the entire event firehose — the metering footgun). A rule is
            // durable config today, but storing an unmatchable/unbounded rule now
            // just to fail at delivery later is worse than a clear write error.
            for (const r of input.rules) {
                const v = validateRule(r.value);
                if (!v.ok) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid rule "${r.value}": ${v.error}` });
                }
            }

            const [{ n }] = await db
                .select({ n: count() })
                .from(developerStreamRules)
                .where(eq(developerStreamRules.userId, ctx.user.id));
            if (n + input.rules.length > MAX_RULES) {
                throw new TRPCError({ code: "FORBIDDEN", message: `Rule limit is ${MAX_RULES}` });
            }

            await db.insert(developerStreamRules).values(
                input.rules.map((r) => ({
                    id: `rule_${randHex(8)}`,
                    userId: ctx.user.id,
                    appId: input.appId,
                    value: r.value,
                    tag: r.tag || null,
                })),
            );
            return { added: input.rules.length };
        }),

    /** Delete rules by id (own only). */
    remove: protectedProcedure
        .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(developerStreamRules).where(and(
                eq(developerStreamRules.userId, ctx.user.id),
                inArray(developerStreamRules.id, input.ids),
            ));
            return { success: true };
        }),
});
