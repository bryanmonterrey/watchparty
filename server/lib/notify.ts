import { db } from "@/db";
import { notifications } from "@/db/schema/content";
import { nanoid } from "nanoid";

type NotifType = "follow" | "like" | "comment" | "repost" | "mention" | "quote" | "system";

interface CreateNotifOptions {
    userId: string;       // recipient
    actorId?: string;     // who did the action
    type: NotifType;
    postId?: string;
    commentId?: string;
    body?: string;
}

export async function createNotification(opts: CreateNotifOptions) {
    // Never notify yourself
    if (opts.actorId && opts.actorId === opts.userId) return;
    try {
        await db.insert(notifications).values({
            id: nanoid(),
            userId: opts.userId,
            actorId: opts.actorId ?? null,
            type: opts.type,
            postId: opts.postId ?? null,
            commentId: opts.commentId ?? null,
            body: opts.body ?? null,
        });
    } catch {
        // non-critical — never let notification failure break the main action
    }
}
