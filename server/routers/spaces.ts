import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import {
    communitySpaces,
    communitySpaceParticipants,
} from "@/db/schema/community/spaces";
import { user } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Spaces = live audio rooms. This router owns the room lifecycle + participant
 * roster (persisted). The realtime audio media transport (WebRTC/SFU) is a
 * separate integration; clients use Supabase presence for live in-room state.
 */
export const spacesRouter = router({
    /** Start a new live space and join as HOST. */
    create: protectedProcedure
        .input(
            z.object({
                title: z.string().min(1).max(120),
                serverId: z.string().uuid().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const [space] = await db
                .insert(communitySpaces)
                .values({
                    title: input.title.trim(),
                    hostId: ctx.user.id,
                    serverId: input.serverId ?? null,
                })
                .returning();

            await db
                .insert(communitySpaceParticipants)
                .values({ spaceId: space.id, userId: ctx.user.id, role: "HOST" })
                .onConflictDoNothing();

            return space;
        }),

    /** All currently-live spaces with host + participant count. */
    listLive: protectedProcedure.query(async () => {
        const rows = await db
            .select({
                id: communitySpaces.id,
                title: communitySpaces.title,
                startedAt: communitySpaces.startedAt,
                hostId: communitySpaces.hostId,
                hostName: user.name,
                hostUsername: user.username,
                hostImage: user.avatar_url,
                participants: count(communitySpaceParticipants.id),
            })
            .from(communitySpaces)
            .innerJoin(user, eq(communitySpaces.hostId, user.id))
            .leftJoin(
                communitySpaceParticipants,
                eq(communitySpaceParticipants.spaceId, communitySpaces.id)
            )
            .where(eq(communitySpaces.status, "LIVE"))
            .groupBy(communitySpaces.id, user.id)
            .orderBy(desc(communitySpaces.startedAt));

        return rows;
    }),

    /** Full space detail + participant roster. */
    get: protectedProcedure
        .input(z.object({ spaceId: z.string().uuid() }))
        .query(async ({ input }) => {
            const [space] = await db
                .select({
                    id: communitySpaces.id,
                    title: communitySpaces.title,
                    status: communitySpaces.status,
                    hostId: communitySpaces.hostId,
                    startedAt: communitySpaces.startedAt,
                    endedAt: communitySpaces.endedAt,
                })
                .from(communitySpaces)
                .where(eq(communitySpaces.id, input.spaceId))
                .limit(1);

            if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Space not found" });

            const participants = await db
                .select({
                    id: communitySpaceParticipants.id,
                    userId: communitySpaceParticipants.userId,
                    role: communitySpaceParticipants.role,
                    joinedAt: communitySpaceParticipants.joinedAt,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url,
                })
                .from(communitySpaceParticipants)
                .innerJoin(user, eq(communitySpaceParticipants.userId, user.id))
                .where(eq(communitySpaceParticipants.spaceId, input.spaceId));

            return { space, participants };
        }),

    /** Join a live space as a listener. */
    join: protectedProcedure
        .input(z.object({ spaceId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [space] = await db
                .select({ status: communitySpaces.status })
                .from(communitySpaces)
                .where(eq(communitySpaces.id, input.spaceId))
                .limit(1);
            if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Space not found" });
            if (space.status !== "LIVE")
                throw new TRPCError({ code: "BAD_REQUEST", message: "This space has ended" });

            await db
                .insert(communitySpaceParticipants)
                .values({ spaceId: input.spaceId, userId: ctx.user.id, role: "LISTENER" })
                .onConflictDoNothing();
            return { success: true };
        }),

    /** Leave a space. If the host leaves, the space ends. */
    leave: protectedProcedure
        .input(z.object({ spaceId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [space] = await db
                .select({ hostId: communitySpaces.hostId })
                .from(communitySpaces)
                .where(eq(communitySpaces.id, input.spaceId))
                .limit(1);

            await db
                .delete(communitySpaceParticipants)
                .where(
                    and(
                        eq(communitySpaceParticipants.spaceId, input.spaceId),
                        eq(communitySpaceParticipants.userId, ctx.user.id)
                    )
                );

            if (space && space.hostId === ctx.user.id) {
                await db
                    .update(communitySpaces)
                    .set({ status: "ENDED", endedAt: new Date() })
                    .where(eq(communitySpaces.id, input.spaceId));
                return { success: true, ended: true };
            }
            return { success: true, ended: false };
        }),

    /** Host ends the space for everyone. */
    end: protectedProcedure
        .input(z.object({ spaceId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const [space] = await db
                .select({ hostId: communitySpaces.hostId })
                .from(communitySpaces)
                .where(eq(communitySpaces.id, input.spaceId))
                .limit(1);
            if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Space not found" });
            if (space.hostId !== ctx.user.id)
                throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can end the space" });

            await db
                .update(communitySpaces)
                .set({ status: "ENDED", endedAt: new Date() })
                .where(eq(communitySpaces.id, input.spaceId));
            return { success: true };
        }),

    /** Host promotes/demotes a participant between SPEAKER and LISTENER. */
    setRole: protectedProcedure
        .input(
            z.object({
                spaceId: z.string().uuid(),
                userId: z.string(),
                role: z.enum(["SPEAKER", "LISTENER"]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const [space] = await db
                .select({ hostId: communitySpaces.hostId })
                .from(communitySpaces)
                .where(eq(communitySpaces.id, input.spaceId))
                .limit(1);
            if (!space || space.hostId !== ctx.user.id)
                throw new TRPCError({ code: "FORBIDDEN", message: "Only the host can manage speakers" });

            await db
                .update(communitySpaceParticipants)
                .set({ role: input.role })
                .where(
                    and(
                        eq(communitySpaceParticipants.spaceId, input.spaceId),
                        eq(communitySpaceParticipants.userId, input.userId)
                    )
                );
            return { success: true };
        }),
});
