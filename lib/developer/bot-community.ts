// Shared plumbing for a bot ACTING inside a community — used by the bot-facing
// tRPC procedures (server/routers/bot.ts) and by background alert delivery
// (lib/coin-feed/community-alerts.ts). Pure server module: throws nothing
// tRPC-specific; callers translate nulls into their own error shapes.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityMembers, communityMessages } from "@/db/schema/community";
import { publishToRoom } from "@/lib/realtime/publish";
import { rooms } from "@/lib/realtime/protocol";

/** Same nudge community.sendMessage sends — clients refetch, content stays in tRPC. */
export function notifyBotChannelChange(channelId: string) {
    return publishToRoom(rooms.communityChannel(channelId), {
        t: "event",
        name: "message-change",
        payload: null,
    });
}

/**
 * The bot's community_members row id, created lazily on first write. A bot IS
 * a real user row, so membership reuses the human table — which is what lets
 * getMessages render bot authors (name/avatar) with zero special-casing, and
 * lets admins see the bot in the roster. Role stays GUEST forever; bot power
 * comes from the install bitfield, never the member role. Uninstall deletes
 * the row (developerBots.ts); app deletion cascades it via the user FK.
 */
export async function botMemberId(botUserId: string, serverId: string): Promise<string | null> {
    const find = () =>
        db
            .select({ id: communityMembers.id })
            .from(communityMembers)
            .where(and(eq(communityMembers.userId, botUserId), eq(communityMembers.serverId, serverId)))
            .limit(1);
    let [member] = await find();
    if (!member) {
        await db
            .insert(communityMembers)
            .values({ userId: botUserId, serverId, role: "GUEST", joinMethod: "bot" })
            .onConflictDoNothing();
        [member] = await find();
    }
    return member?.id ?? null;
}

/** Insert a message authored by the bot + nudge the channel. Null on failure. */
export async function postAsBot(
    botUserId: string,
    serverId: string,
    channelId: string,
    content: string,
): Promise<string | null> {
    const memberId = await botMemberId(botUserId, serverId);
    if (!memberId) return null;
    const [msg] = await db
        .insert(communityMessages)
        .values({ channelId, memberId, content })
        .returning({ id: communityMessages.id });
    if (msg) await notifyBotChannelChange(channelId);
    return msg?.id ?? null;
}
