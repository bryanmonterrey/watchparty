import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { follows } from "@/db/schema/content/follow";
import { user } from "@/db/schema";
import { eq, and, or, like, inArray, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { awardXP } from "@/server/lib/xp";
import { recordQuestEvent } from "@/server/lib/quests";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Friends are modelled as **mutual follows** over the existing `follows` graph:
 *   - friend           → I follow them AND they follow me
 *   - incoming request → they follow me, I don't follow back (I can Accept)
 *   - outgoing request → I follow them, they don't follow back (Pending)
 * Adding / accepting a friend = follow; removing / cancelling = unfollow.
 */
type PublicUser = {
    id: string;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
};

async function hydrateUsers(ids: string[]): Promise<Map<string, PublicUser & { isOnline: boolean }>> {
    const map = new Map<string, PublicUser & { isOnline: boolean }>();
    if (!ids.length) return map;
    const rows = await db
        .select({
            id: user.id,
            name: user.name,
            username: user.username,
            avatar_url: user.avatar_url,
            lastSeenAt: user.lastSeenAt,
            showOnlineStatus: user.showOnlineStatus,
        })
        .from(user)
        .where(inArray(user.id, ids));
    for (const r of rows) {
        const isOnline =
            !!r.showOnlineStatus && !!r.lastSeenAt && Date.now() - r.lastSeenAt.getTime() < ONLINE_WINDOW_MS;
        map.set(r.id, { id: r.id, name: r.name, username: r.username, avatar_url: r.avatar_url, isOnline });
    }
    return map;
}

/** Returns {following, followers} id sets for the current user. */
async function edges(userId: string) {
    const [outgoing, incoming] = await Promise.all([
        db.select({ id: follows.followingId }).from(follows).where(eq(follows.followerId, userId)),
        db.select({ id: follows.followerId }).from(follows).where(eq(follows.followingId, userId)),
    ]);
    return {
        following: new Set(outgoing.map((r) => r.id)),
        followers: new Set(incoming.map((r) => r.id)),
    };
}

export const friendsRouter = router({
    /** Mutual follows. `onlineOnly` filters to friends currently online. */
    list: protectedProcedure
        .input(z.object({ onlineOnly: z.boolean().default(false) }).optional())
        .query(async ({ ctx, input }) => {
            const { following, followers } = await edges(ctx.user.id);
            const friendIds = [...following].filter((id) => followers.has(id));
            const users = await hydrateUsers(friendIds);
            let friends = friendIds
                .map((id) => users.get(id))
                .filter((u): u is PublicUser & { isOnline: boolean } => !!u);
            if (input?.onlineOnly) friends = friends.filter((f) => f.isOnline);
            // online first, then alphabetical
            friends.sort(
                (a, b) =>
                    Number(b.isOnline) - Number(a.isOnline) ||
                    (a.name ?? a.username ?? "").localeCompare(b.name ?? b.username ?? "")
            );
            return { friends, onlineCount: friends.filter((f) => f.isOnline).length };
        }),

    /** Incoming (can accept) + outgoing (awaiting) requests. */
    pending: protectedProcedure.query(async ({ ctx }) => {
        const { following, followers } = await edges(ctx.user.id);
        const incomingIds = [...followers].filter((id) => !following.has(id));
        const outgoingIds = [...following].filter((id) => !followers.has(id));
        const users = await hydrateUsers([...incomingIds, ...outgoingIds]);
        const pick = (ids: string[]) =>
            ids.map((id) => users.get(id)).filter((u): u is PublicUser & { isOnline: boolean } => !!u);
        return { incoming: pick(incomingIds), outgoing: pick(outgoingIds) };
    }),

    /** Send a friend request (follow) by user id. Accepting an incoming request uses this too. */
    add: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            if (input.userId === ctx.user.id)
                throw new TRPCError({ code: "BAD_REQUEST", message: "You can't add yourself" });
            await db
                .insert(follows)
                .values({ followerId: ctx.user.id, followingId: input.userId })
                .onConflictDoNothing();
            await awardXP(input.userId, "follow_received", ctx.user.id);
            await recordQuestEvent(input.userId, "follow_received");
            const { followers } = await edges(ctx.user.id);
            return { success: true, nowFriends: followers.has(input.userId) };
        }),

    /** Add a friend by @username. */
    addByUsername: protectedProcedure
        .input(z.object({ username: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const handle = input.username.trim().replace(/^@/, "");
            const found = await db
                .select({ id: user.id })
                .from(user)
                .where(and(or(eq(user.username, handle), like(user.username, handle)), ne(user.id, ctx.user.id)))
                .limit(1);
            if (!found.length)
                throw new TRPCError({ code: "NOT_FOUND", message: `No user @${handle}` });
            await db
                .insert(follows)
                .values({ followerId: ctx.user.id, followingId: found[0].id })
                .onConflictDoNothing();
            await awardXP(found[0].id, "follow_received", ctx.user.id);
            await recordQuestEvent(found[0].id, "follow_received");
            const { followers } = await edges(ctx.user.id);
            return { success: true, userId: found[0].id, nowFriends: followers.has(found[0].id) };
        }),

    /** Remove a friend / cancel a request (unfollow). */
    remove: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db
                .delete(follows)
                .where(and(eq(follows.followerId, ctx.user.id), eq(follows.followingId, input.userId)));
            return { success: true };
        }),
});
