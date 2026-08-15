import "server-only";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { feedSignals } from "@/db/schema/content";

// Dwell saturates as a signal — beyond a couple minutes it's almost certainly an
// idle/backgrounded tab, not attention. Cap accumulated dwell per (user, post)
// so one left-open tab can't dominate ranking/training. (A bug shipped without
// this produced 883 dwell rows for a single card from a ~3.5h idle tab.)
const DWELL_CAP_SECONDS = 180;

// Records engagement events into feed_signals for the Phoenix ranker. Action
// indices match Phoenix's vocabulary (see db/schema/content/feed_signals.ts).
//
// Best-effort: a signal write must NEVER fail or slow a user action, so errors
// are swallowed. Callers await it (a single cheap insert) rather than dangling
// the promise, since background work can be cut off on Workers.

// Defined in ./config (which has no `server-only`) so tests can import the
// indices and assert they stay inside the model's logit slots. Re-exported
// here because every caller imports ACTION from this module.
export { ACTION } from "./config";
import { ACTION } from "./config";

export async function recordSignal(p: {
    userId: string;
    subjectId: string;
    subjectType?: "post" | "stream";
    authorId?: string | null;
    actionType: number;
    value?: number;
    surface?: string;
    /**
     * When set, the row id is deterministic and a duplicate insert is a no-op.
     * Use for "once per (user, content)" signals (e.g. a video quality view)
     * emitted from high-frequency mutations, to avoid flooding the log.
     */
    dedupeKey?: string;
}): Promise<void> {
    try {
        const row = {
            id: p.dedupeKey ?? nanoid(),
            userId: p.userId,
            subjectId: p.subjectId,
            subjectType: p.subjectType ?? "post",
            authorId: p.authorId ?? null,
            actionType: p.actionType,
            value: p.value ?? 1,
            surface: p.surface ?? "home",
        };
        if (p.dedupeKey) {
            await db.insert(feedSignals).values(row).onConflictDoNothing({ target: feedSignals.id });
        } else {
            await db.insert(feedSignals).values(row);
        }
    } catch {
        // best-effort; signal loss is acceptable, blocking the user action is not
    }
}

/**
 * Accumulate dwell into a SINGLE row per (user, subject) instead of one row per
 * client flush. The client sends incremental visible-seconds; we add them into
 * one row, capped at DWELL_CAP_SECONDS, and refresh createdAt so the row stays
 * "recent" for history assembly. This is the server backstop against dwell-row
 * explosion / idle-tab inflation, independent of any client-side fix.
 */
export async function accumulateDwell(p: {
    userId: string;
    subjectId: string;
    subjectType?: "post" | "stream";
    authorId?: string | null;
    seconds: number;
    surface?: string;
}): Promise<void> {
    try {
        const id = `dwell_${p.userId}_${p.subjectId}`;
        const add = Math.min(p.seconds, DWELL_CAP_SECONDS);
        await db
            .insert(feedSignals)
            .values({
                id,
                userId: p.userId,
                subjectId: p.subjectId,
                subjectType: p.subjectType ?? "post",
                authorId: p.authorId ?? null,
                actionType: ACTION.DWELL,
                value: add,
                surface: p.surface ?? "home",
            })
            .onConflictDoUpdate({
                target: feedSignals.id,
                set: {
                    value: sql`least(${feedSignals.value} + ${add}, ${DWELL_CAP_SECONDS})`,
                    createdAt: new Date(),
                },
            });
    } catch {
        // best-effort
    }
}
