import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc } from "drizzle-orm";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { developerAnnouncements } from "@/db/schema/content/developer-announcement";
import { randHex } from "@/lib/api-gate";

// The console Notifications feed (X's §2). Everyone reads; admins author.
export const developerAnnouncementsRouter = router({
    list: protectedProcedure.query(async () => {
        return db
            .select()
            .from(developerAnnouncements)
            .orderBy(desc(developerAnnouncements.createdAt))
            .limit(50);
    }),

    create: protectedProcedure
        .input(z.object({
            title: z.string().trim().min(1).max(160),
            body: z.string().trim().min(1).max(4000),
            level: z.enum(["info", "warning", "incident"]).default("info"),
        }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.role !== "admin") {
                throw new TRPCError({ code: "FORBIDDEN", message: "Admins only" });
            }
            const id = `ann_${randHex(8)}`;
            await db.insert(developerAnnouncements).values({
                id,
                title: input.title,
                body: input.body,
                level: input.level,
                createdBy: ctx.user.id,
            });
            return { id };
        }),
});
