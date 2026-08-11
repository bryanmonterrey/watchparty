import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { streamSessions } from "@/db/schema/content/stream-session";

// Broadcast-history recording for the studio Producer list. Both are
// best-effort: a failure here must never break going live/offline. Open is
// idempotent (the IVS webhook and the manual toggle can both fire for one
// go-live), so a second call while a session is open is a no-op.

export async function openStreamSession(userId: string, title?: string | null, category?: string | null) {
    try {
        const [open] = await db
            .select({ id: streamSessions.id })
            .from(streamSessions)
            .where(and(eq(streamSessions.userId, userId), isNull(streamSessions.endedAt)))
            .limit(1);
        if (open) return;
        await db.insert(streamSessions).values({
            id: nanoid(),
            userId,
            title: title ?? null,
            category: category ?? null,
        });
    } catch (err) {
        console.error("openStreamSession failed:", err);
    }
}

export async function closeStreamSession(userId: string) {
    try {
        const [open] = await db
            .select({ id: streamSessions.id })
            .from(streamSessions)
            .where(and(eq(streamSessions.userId, userId), isNull(streamSessions.endedAt)))
            .orderBy(desc(streamSessions.startedAt))
            .limit(1);
        if (!open) return;
        await db.update(streamSessions).set({ endedAt: new Date() }).where(eq(streamSessions.id, open.id));
    } catch (err) {
        console.error("closeStreamSession failed:", err);
    }
}
