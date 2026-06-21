import { PARTY, type ServerEvent } from "./protocol";

/**
 * Server-side fan-out: push an authoritative event into a realtime room so
 * connected clients receive it instantly over WebSocket.
 *
 * Called from tRPC mutations AFTER the DB write — persistence + E2E encryption
 * stay in tRPC; this only handles delivery (replacing Supabase postgres_changes).
 * Best-effort: a realtime hiccup never blocks or fails the mutation.
 */
export async function publishToRoom(room: string, event: ServerEvent): Promise<void> {
  const host = process.env.REALTIME_HOST ?? process.env.NEXT_PUBLIC_REALTIME_HOST;
  const secret = process.env.REALTIME_SECRET;
  // Realtime not configured (e.g. local dev without the worker) → no-op.
  if (!host || !secret) return;

  const url = `https://${host}/parties/${PARTY}/${encodeURIComponent(room)}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-realtime-secret": secret },
      body: JSON.stringify(event),
    });
  } catch (err) {
    console.error("[realtime] publish failed", room, err);
  }
}
