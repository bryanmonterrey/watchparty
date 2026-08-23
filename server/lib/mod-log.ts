import { db } from "@/db";
import { moderationActions } from "@/db/schema/content/moderation-action";
import { nanoid } from "nanoid";

/**
 * Write one line to a channel's moderation audit log.
 *
 * Shaped after server/lib/notify.ts on purpose, including the swallowed error:
 * a log write must never be the reason a ban fails. Losing an audit line is
 * bad; leaving an abusive viewer in chat because the logger threw is worse,
 * and the caller has already committed the real change by the time we run.
 *
 * Call it AFTER the mutation succeeds — a log of things that did not happen is
 * worse than no log.
 */
type ModAction =
    | "ban"
    | "unban"
    | "mod_add"
    | "mod_remove"
    | "vip_add"
    | "vip_remove"
    | "chat_mode"
    | "pin_message";

export async function logModAction(opts: {
    /** Whose channel. */
    creatorId: string;
    /** Who acted — the creator themselves, or one of their moderators. */
    actorId?: string | null;
    /** Who it was done to; omitted for channel-wide actions. */
    targetUserId?: string | null;
    action: ModAction;
    /** Ban reason, chosen chat mode, pinned text — whatever gives the line meaning. */
    detail?: string | null;
}) {
    try {
        await db.insert(moderationActions).values({
            id: nanoid(),
            creatorId: opts.creatorId,
            actorId: opts.actorId ?? null,
            targetUserId: opts.targetUserId ?? null,
            action: opts.action,
            // Long pins and long reasons are a log, not a document.
            detail: opts.detail ? opts.detail.slice(0, 280) : null,
        });
    } catch {
        // Never let the audit trail break the action it is auditing.
    }
}
