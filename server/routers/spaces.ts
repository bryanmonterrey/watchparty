import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import {
    communitySpaces,
    communitySpaceParticipants,
} from "@/db/schema/community/spaces";
import { user } from "@/db/schema";
import { posts } from "@/db/schema/content/post";
import { postTagsInput, writePostTags } from "@/server/lib/write-post-tags";
import { nanoid } from "nanoid";
import { eq, and, desc, count, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publishToRoom } from "@/lib/realtime/publish";
import { rooms } from "@/lib/realtime/protocol";
import {
    isMediaEnabled,
    createMeeting,
    addParticipant,
    REALTIMEKIT_PRESETS,
} from "@/lib/realtime/media/realtimekit";

/** Tell everyone in a space its roster/status changed → they refetch. */
function notifySpaceChange(spaceId: string) {
    return publishToRoom(rooms.space(spaceId), {
        t: "event",
        name: "roster-change",
        payload: null,
    });
}

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
                // Coins the title tags, same validator and same meaning as a
                // post's or a stream's.
                tags: postTagsInput,
                // Whether the space's post reaches the feed. This is the post's
                // own column — the "visible or not" option is not a new concept
                // and must not become a second one.
                visibility: z.enum(["public", "private", "unlisted"]).default("public"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const title = input.title.trim();
            const [space] = await db
                .insert(communitySpaces)
                .values({
                    title,
                    hostId: ctx.user.id,
                    serverId: input.serverId ?? null,
                })
                .returning();

            await db
                .insert(communitySpaceParticipants)
                .values({ spaceId: space.id, userId: ctx.user.id, role: "HOST" })
                .onConflictDoNothing();

            // ── The post ────────────────────────────────────────────────────
            //
            // A space is a post, exactly as a stream is (stream.startBroadcast).
            //
            // NO videoUrl, and that is the difference from a stream rather than
            // an omission: a space is audio, and `getVideoFeed` gates on
            // isNotNull(videoUrl), so this belongs in the main feed and not on
            // a surface built for video.
            //
            // Best-effort: the space is the thing with value and the caller is
            // already joining the room. A post that fails to write must not
            // fail the space that is now live.
            let postId: string | null = null;
            try {
                postId = nanoid();
                await db.insert(posts).values({
                    id: postId,
                    userId: ctx.user.id,
                    spaceId: space.id,
                    title,
                    isLive: true,
                    status: "published",
                    visibility: input.visibility,
                });
                // Filtered against the title as saved, the same rule the
                // composer applies: a coin picked and then deleted from the
                // text must not tag the post.
                const picked = (input.tags ?? []).filter((t) =>
                    title.toLowerCase().includes(`$${t.symbol.toLowerCase()}`),
                );
                if (picked.length) await writePostTags(postId, picked);
            } catch (err) {
                postId = null;
                console.error("[spaces.create] post failed:", err instanceof Error ? err.message : err);
            }

            return { ...space, postId };
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
                    handRaised: communitySpaceParticipants.handRaised,
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
            await notifySpaceChange(input.spaceId);
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
                await notifySpaceChange(input.spaceId);
                return { success: true, ended: true };
            }
            await notifySpaceChange(input.spaceId);
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

            // Retire the post this space created. Without it an ended space
            // keeps a LIVE badge in the feed forever — the same trap the stream
            // path hit (app/api/webhooks/ivs). Best-effort: ending the space is
            // what the host asked for and must not fail on the annotation.
            try {
                await db
                    .update(posts)
                    .set({ isLive: false })
                    .where(and(eq(posts.spaceId, input.spaceId), eq(posts.isLive, true)));
            } catch (err) {
                console.error("[spaces.end] retiring post failed:", err instanceof Error ? err.message : err);
            }

            await notifySpaceChange(input.spaceId);
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
                // Clear any raised hand on a role change (promote answers the request).
                .set({ role: input.role, handRaised: false })
                .where(
                    and(
                        eq(communitySpaceParticipants.spaceId, input.spaceId),
                        eq(communitySpaceParticipants.userId, input.userId)
                    )
                );
            await notifySpaceChange(input.spaceId);
            return { success: true };
        }),

    /** Listener raises/lowers their hand to request speaking. */
    requestToSpeak: protectedProcedure
        .input(z.object({ spaceId: z.string().uuid(), raised: z.boolean().default(true) }))
        .mutation(async ({ ctx, input }) => {
            const [me] = await db
                .select({ role: communitySpaceParticipants.role })
                .from(communitySpaceParticipants)
                .where(
                    and(
                        eq(communitySpaceParticipants.spaceId, input.spaceId),
                        eq(communitySpaceParticipants.userId, ctx.user.id)
                    )
                )
                .limit(1);
            if (!me) throw new TRPCError({ code: "FORBIDDEN", message: "Join the space first" });
            if (me.role !== "LISTENER")
                throw new TRPCError({ code: "BAD_REQUEST", message: "You can already speak" });

            await db
                .update(communitySpaceParticipants)
                .set({ handRaised: input.raised })
                .where(
                    and(
                        eq(communitySpaceParticipants.spaceId, input.spaceId),
                        eq(communitySpaceParticipants.userId, ctx.user.id)
                    )
                );
            await notifySpaceChange(input.spaceId);
            return { success: true };
        }),

    /**
     * Mint a Cloudflare RealtimeKit auth token so the caller can join this
     * space's WebRTC audio. Preset (publish vs receive-only) is derived from the
     * caller's role. The meeting is created lazily on first join and cached on
     * the space row. Returns `{ enabled: false }` when media isn't provisioned.
     */
    getMediaToken: protectedProcedure
        .input(z.object({ spaceId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            if (!isMediaEnabled()) return { enabled: false as const };

            const [space] = await db
                .select({
                    title: communitySpaces.title,
                    status: communitySpaces.status,
                    meetingId: communitySpaces.mediaMeetingId,
                })
                .from(communitySpaces)
                .where(eq(communitySpaces.id, input.spaceId))
                .limit(1);
            if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Space not found" });
            if (space.status !== "LIVE")
                throw new TRPCError({ code: "BAD_REQUEST", message: "This space has ended" });

            const [participant] = await db
                .select({ role: communitySpaceParticipants.role })
                .from(communitySpaceParticipants)
                .where(
                    and(
                        eq(communitySpaceParticipants.spaceId, input.spaceId),
                        eq(communitySpaceParticipants.userId, ctx.user.id)
                    )
                )
                .limit(1);
            if (!participant)
                throw new TRPCError({ code: "FORBIDDEN", message: "Join the space before connecting audio" });

            // Lazily create the meeting; guard against a concurrent first-join race.
            let meetingId = space.meetingId;
            if (!meetingId) {
                const created = await createMeeting(space.title);
                const [won] = await db
                    .update(communitySpaces)
                    .set({ mediaMeetingId: created })
                    .where(and(eq(communitySpaces.id, input.spaceId), isNull(communitySpaces.mediaMeetingId)))
                    .returning({ id: communitySpaces.mediaMeetingId });
                if (won?.id) {
                    meetingId = won.id;
                } else {
                    const [fresh] = await db
                        .select({ id: communitySpaces.mediaMeetingId })
                        .from(communitySpaces)
                        .where(eq(communitySpaces.id, input.spaceId))
                        .limit(1);
                    meetingId = fresh?.id ?? created;
                }
            }

            const canSpeak = participant.role === "HOST" || participant.role === "SPEAKER";
            const authToken = await addParticipant(meetingId, {
                name: ctx.user.name ?? "Guest",
                presetName: canSpeak ? REALTIMEKIT_PRESETS.speaker : REALTIMEKIT_PRESETS.listener,
                customParticipantId: ctx.user.id,
            });

            return { enabled: true as const, authToken, canSpeak };
        }),
});
