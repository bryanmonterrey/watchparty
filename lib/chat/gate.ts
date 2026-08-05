import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { streams } from "@/db/schema/content/stream";
import { follows, subscriptions } from "@/db/schema/content";

// Who may talk in a channel's chat.
//
// Shared by two callers that must never disagree: the realtime token route,
// which signs the answer into a room-scoped claim the Durable Object enforces,
// and the tRPC query the composer reads to render the lock. If those two
// diverge, a viewer sees an open input that silently drops what they type —
// so the rule lives here once rather than being written twice.

export type ChatMode = "everyone" | "followers" | "subscribers";

export type ChatGate = {
    mode: ChatMode;
    /** How long a follow must have existed before it counts. 0 = immediately. */
    followerMinutes: number;
    canChat: boolean;
    /** Null when they can chat. Otherwise why not, phrased for the viewer. */
    reason: string | null;
    /** When a waiting follower becomes eligible, so the UI can count down. */
    eligibleAt: string | null;
};

const OPEN: ChatGate = {
    mode: "everyone",
    followerMinutes: 0,
    canChat: true,
    reason: null,
    eligibleAt: null,
};

function waitLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Evaluates the gate for one viewer in one channel.
 *
 * The host and their moderators are never gated — a channel owner locking
 * themselves out of their own chat is never the intent.
 */
export async function evaluateChatGate(
    creatorId: string,
    viewerId: string | null,
    isModerator = false,
): Promise<ChatGate> {
    const [row] = await db
        .select({ mode: streams.chatMode, minutes: streams.chatFollowerMinutes })
        .from(streams)
        .where(eq(streams.userId, creatorId))
        .limit(1);

    const mode = (row?.mode ?? "everyone") as ChatMode;
    const followerMinutes = row?.minutes ?? 0;
    if (mode === "everyone") return { ...OPEN, followerMinutes };

    const base = { mode, followerMinutes, canChat: false, eligibleAt: null };
    if (!viewerId) return { ...base, reason: "Sign in to chat" };
    if (viewerId === creatorId || isModerator) return { ...OPEN, mode, followerMinutes };

    if (mode === "subscribers") {
        const [sub] = await db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(and(
                eq(subscriptions.subscriberId, viewerId),
                eq(subscriptions.creatorId, creatorId),
                eq(subscriptions.status, "active"),
            ))
            .limit(1);
        return sub
            ? { ...OPEN, mode, followerMinutes }
            : { ...base, reason: "Subscribers only" };
    }

    const [follow] = await db
        .select({ since: follows.createdAt })
        .from(follows)
        .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, creatorId)))
        .limit(1);

    if (!follow) return { ...base, reason: "Followers only" };
    if (followerMinutes <= 0) return { ...OPEN, mode, followerMinutes };

    const eligible = new Date(new Date(follow.since).getTime() + followerMinutes * 60_000);
    if (eligible.getTime() <= Date.now()) return { ...OPEN, mode, followerMinutes };

    return {
        ...base,
        reason: `Followers for ${waitLabel(followerMinutes)}`,
        eligibleAt: eligible.toISOString(),
    };
}
