import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { db } from "@/db";
import { profilePanels } from "@/db/schema/content";
import { and, asc, count, eq, max, sql } from "drizzle-orm";

// Profile About-tab panels (Twitch/Kick model): each panel is just
// { image, link?, title?, body? } — the "custom" look comes from the uploaded
// art, not from widget types. Owner-only mutations; public reads.

const MAX_PANELS = 20;

const httpUrl = z.string().trim().url().max(500)
    .refine((u) => /^https?:\/\//i.test(u), "Link must be http(s)");

const panelInput = z.object({
    id: z.string().optional(),                          // present = update
    title: z.string().trim().max(60).nullable().optional(),
    imageUrl: z.string().trim().url().max(500).nullable().optional(),
    linkUrl: httpUrl.nullable().optional(),
    body: z.string().trim().max(500).nullable().optional(),
}).refine((p) => p.imageUrl || p.body || p.title, "Panel needs an image, title, or text");

export const panelsRouter = router({
    list: publicProcedure
        .input(z.object({ userId: z.string() }))
        .query(({ input }) =>
            db.select().from(profilePanels)
                .where(eq(profilePanels.userId, input.userId))
                .orderBy(asc(profilePanels.position), asc(profilePanels.createdAt)),
        ),

    save: protectedProcedure
        .input(panelInput)
        .mutation(async ({ ctx, input }) => {
            const { id, ...fields } = input;
            if (id) {
                const [updated] = await db.update(profilePanels)
                    .set(fields)
                    .where(and(eq(profilePanels.id, id), eq(profilePanels.userId, ctx.user.id)))
                    .returning();
                if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
                return updated;
            }
            const [{ total, maxPos }] = await db
                .select({ total: count(), maxPos: max(profilePanels.position) })
                .from(profilePanels)
                .where(eq(profilePanels.userId, ctx.user.id));
            if (total >= MAX_PANELS) {
                throw new TRPCError({ code: "BAD_REQUEST", message: `Max ${MAX_PANELS} panels` });
            }
            const [created] = await db.insert(profilePanels)
                .values({ ...fields, userId: ctx.user.id, position: (maxPos ?? 0) + 1 })
                .returning();
            return created;
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(profilePanels)
                .where(and(eq(profilePanels.id, input.id), eq(profilePanels.userId, ctx.user.id)));
            return { success: true };
        }),

    /** Full ordered id list → positions rewritten to match. Owner-scoped. */
    reorder: protectedProcedure
        .input(z.object({ ids: z.array(z.string()).min(1).max(MAX_PANELS) }))
        .mutation(async ({ ctx, input }) => {
            await Promise.all(input.ids.map((id, i) =>
                db.update(profilePanels)
                    .set({ position: i + 1 })
                    .where(and(eq(profilePanels.id, id), eq(profilePanels.userId, ctx.user.id))),
            ));
            return { success: true };
        }),
});
