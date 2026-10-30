import "server-only";
import { publish } from "./hub";
import type { ServerEvent } from "./protocol";

/**
 * Server-side fan-out: push an authoritative event into a realtime room so
 * connected clients receive it instantly over WebSocket.
 *
 * Called from tRPC mutations AFTER the DB write — persistence + E2E encryption
 * stay in tRPC; this only handles delivery. Best-effort: a realtime hiccup
 * never blocks or fails the mutation.
 *
 * In-process since the move to Vercel (2026-10-29): the realtime layer runs in
 * this app (lib/realtime/hub.ts), so publishing is a Redis PUBLISH rather than
 * an HTTP call to a separate worker.
 */
export async function publishToRoom(room: string, event: ServerEvent): Promise<void> {
    if (!process.env.UPSTASH_REDIS_REST_URL) {
        // Silence here would be indistinguishable from a delivered event,
        // which is how a dead realtime layer stays invisible.
        console.warn("[realtime] not configured — event dropped", { room });
        return;
    }
    // Room names come from `rooms.*`, which interpolate ids into fixed
    // prefixes; a `/` or `?` would make a room the socket path can't reach.
    if (/[/?#]/.test(room)) {
        console.error("[realtime] refusing to publish to unsafe room name", room);
        return;
    }
    try {
        const res = await publish(room, event);
        if (!res.ok) console.error("[realtime] publish rejected", room, res.status);
    } catch (err) {
        console.error("[realtime] publish failed", room, err);
    }
}
