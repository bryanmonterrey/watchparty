import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { communityWebhooks, communityMessages } from "@/db/schema/community";
import { eq } from "drizzle-orm";
import { publishToRoom } from "@/lib/realtime/publish";
import { rooms } from "@/lib/realtime/protocol";

// Incoming community webhook — Discord-compatible shape. External services
// POST { content, username?, avatar_url? } to /api/webhooks/community/:id/:token
// and it lands as a message in the webhook's channel. The token IS the auth;
// no session involved.

const MAX_CONTENT = 2000;

function tokenMatches(expected: string, provided: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ webhookId: string; token: string }> },
) {
    const { webhookId, token } = await params;

    if (!/^[0-9a-f-]{36}$/.test(webhookId)) {
        return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
    }

    const [hook] = await db
        .select()
        .from(communityWebhooks)
        .where(eq(communityWebhooks.id, webhookId))
        .limit(1);
    // Same response for wrong id and wrong token — don't confirm ids exist.
    if (!hook || !tokenMatches(hook.token, token)) {
        return NextResponse.json({ error: "Unknown webhook" }, { status: 404 });
    }

    let body: { content?: unknown; username?: unknown; avatar_url?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
        return NextResponse.json({ error: "content is required" }, { status: 400 });
    }
    if (content.length > MAX_CONTENT) {
        return NextResponse.json({ error: `content exceeds ${MAX_CONTENT} characters` }, { status: 400 });
    }
    const username =
        typeof body.username === "string" && body.username.trim()
            ? body.username.trim().slice(0, 50)
            : hook.name;
    const avatar =
        typeof body.avatar_url === "string" && /^https:\/\//.test(body.avatar_url)
            ? body.avatar_url.slice(0, 500)
            : hook.avatarUrl;

    const [message] = await db
        .insert(communityMessages)
        .values({
            content,
            channelId: hook.channelId,
            memberId: null,
            webhookId: hook.id,
            webhookName: username,
            webhookAvatar: avatar,
        })
        .returning();

    await db
        .update(communityWebhooks)
        .set({ lastUsedAt: new Date() })
        .where(eq(communityWebhooks.id, hook.id));

    // Same realtime nudge the tRPC send path uses — open chats refetch instantly.
    await publishToRoom(rooms.communityChannel(hook.channelId), {
        t: "event",
        name: "message-change",
        payload: null,
    }).catch(() => {});

    return NextResponse.json({ id: message.id }, { status: 200 });
}
