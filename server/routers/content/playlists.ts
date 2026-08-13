/**
 * Playlists: create one, list your own, add a video to some.
 *
 * Split out of server/routers/content.ts, which was 1580 lines against a
 * 1000-line guard. Pure move — these procedures are byte-identical to what
 * lived there, and they are spread back into the same router, so every caller
 * path (trpc.content.*) is unchanged.
 */
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { db } from "@/db";
import { playlists, playlistVideos } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, desc, and, count, or } from "drizzle-orm";
import { nanoid } from "nanoid";

export const playlistProcedures = {
    createPlaylist: protectedProcedure
        .input(
            z.object({
                title: z.string().min(1),
                description: z.string().optional(),
                visibility: z.enum(["public", "private", "unlisted"]).default("public"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const playlistId = nanoid();

            await db.insert(playlists).values({
                id: playlistId,
                userId: ctx.session.user.id,
                title: input.title,
                description: input.description,
                visibility: input.visibility,
            });

            return { success: true, playlistId };
        }),

    getMyPlaylists: protectedProcedure.query(async ({ ctx }) => {
        return await db
            .select()
            .from(playlists)
            .where(eq(playlists.userId, ctx.session.user.id))
            .orderBy(desc(playlists.updatedAt));
    }),

    addToPlaylist: protectedProcedure
        .input(
            z.object({
                playlistId: z.string(),
                videoId: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Verify ownership
            const playlist = await db.query.playlists.findFirst({
                where: and(
                    eq(playlists.id, input.playlistId),
                    eq(playlists.userId, ctx.session.user.id)
                ),
            });

            if (!playlist) {
                throw new Error("Playlist not found or access denied");
            }

            // Get current count for position
            const videoCount = await db
                .select({ count: count() })
                .from(playlistVideos)
                .where(eq(playlistVideos.playlistId, input.playlistId));

            const position = (videoCount[0]?.count || 0) + 1;

            await db.insert(playlistVideos).values({
                playlistId: input.playlistId,
                postId: input.videoId,
                position,
            });

            // Update timestamp
            await db
                .update(playlists)
                .set({ updatedAt: new Date() })
                .where(eq(playlists.id, input.playlistId));

            return { success: true };
        }),
};
