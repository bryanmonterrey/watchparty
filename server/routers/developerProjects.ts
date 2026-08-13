import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { developerProjects } from "@/db/schema/content/developer-project";
import { developerApps } from "@/db/schema/content/developer-app";
import { randHex } from "@/lib/api-gate";
import { limitOrPass, webhookMutationLimiter } from "@/lib/rate-limit";

// Developer Projects — an organizational bucket that groups apps (and through
// them their keys/webhooks). ORG-ONLY: `plan` is an inert stub so the console
// can show X's plan chip; a project grants and gates nothing. Money and
// entitlements stay at the account level.
//
// Ownership is enforced in every handler (RLS is defense-in-depth; the app
// connects as the table owner on some paths, so the explicit owner filter is
// the real gate).

const MAX_PROJECTS = 25;

async function throttle(userId: string): Promise<void> {
    if (!(await limitOrPass(webhookMutationLimiter, userId))) {
        throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many changes — wait a minute and try again",
        });
    }
}

/** Load an owned project or throw NOT_FOUND. */
async function ownedProject(userId: string, id: string) {
    const [row] = await db
        .select()
        .from(developerProjects)
        .where(and(eq(developerProjects.id, id), eq(developerProjects.ownerId, userId)))
        .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
}

export const developerProjectsRouter = router({
    /** The caller's projects, newest first, each with its live app count. */
    list: protectedProcedure.query(async ({ ctx }) => {
        const projects = await db
            .select({
                id: developerProjects.id,
                name: developerProjects.name,
                plan: developerProjects.plan,
                createdAt: developerProjects.createdAt,
            })
            .from(developerProjects)
            .where(eq(developerProjects.ownerId, ctx.user.id))
            .orderBy(desc(developerProjects.createdAt));
        if (!projects.length) return [];

        // App counts per project in one grouped query (non-deleted only).
        const counts = await db
            .select({ projectId: developerApps.projectId, n: count() })
            .from(developerApps)
            .where(and(eq(developerApps.ownerId, ctx.user.id), isNull(developerApps.deletedAt)))
            .groupBy(developerApps.projectId);
        const byProject = new Map(counts.map((c) => [c.projectId, c.n]));

        return projects.map((p) => ({
            id: p.id,
            name: p.name,
            plan: p.plan,
            appCount: byProject.get(p.id) ?? 0,
            createdAt: p.createdAt,
        }));
    }),

    create: protectedProcedure
        .input(z.object({ name: z.string().trim().min(1).max(64) }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const [{ n }] = await db
                .select({ n: count() })
                .from(developerProjects)
                .where(eq(developerProjects.ownerId, ctx.user.id));
            if (n >= MAX_PROJECTS) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `You're at the ${MAX_PROJECTS}-project limit — delete one first`,
                });
            }
            const id = `wpproj_${randHex(8)}`;
            await db.insert(developerProjects).values({ id, ownerId: ctx.user.id, name: input.name });
            return { id };
        }),

    rename: protectedProcedure
        .input(z.object({ id: z.string(), name: z.string().trim().min(1).max(64) }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const updated = await db
                .update(developerProjects)
                .set({ name: input.name, updatedAt: new Date() })
                .where(and(eq(developerProjects.id, input.id), eq(developerProjects.ownerId, ctx.user.id)))
                .returning({ id: developerProjects.id });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
            return { success: true };
        }),

    /** Delete a project. Its apps are UN-FILED, not deleted — the DB FK is
     *  ON DELETE SET NULL, so project_id clears itself; the apps survive. */
    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            const deleted = await db
                .delete(developerProjects)
                .where(and(eq(developerProjects.id, input.id), eq(developerProjects.ownerId, ctx.user.id)))
                .returning({ id: developerProjects.id });
            if (!deleted.length) throw new TRPCError({ code: "NOT_FOUND" });
            return { success: true };
        }),

    /** Move an app into a project (or unfile it with projectId=null). Both the
     *  app and the project must belong to the caller — otherwise nothing moves. */
    assignApp: protectedProcedure
        .input(z.object({ appId: z.string(), projectId: z.string().nullable() }))
        .mutation(async ({ ctx, input }) => {
            await throttle(ctx.user.id);
            if (input.projectId) await ownedProject(ctx.user.id, input.projectId);
            const updated = await db
                .update(developerApps)
                .set({ projectId: input.projectId, updatedAt: new Date() })
                .where(and(
                    eq(developerApps.id, input.appId),
                    eq(developerApps.ownerId, ctx.user.id),
                    isNull(developerApps.deletedAt),
                ))
                .returning({ id: developerApps.id });
            if (!updated.length) throw new TRPCError({ code: "NOT_FOUND" });
            return { projectId: input.projectId };
        }),
});
