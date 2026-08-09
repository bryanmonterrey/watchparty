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
  if (!host || !secret) {
    // Was a silent return. Silence here is indistinguishable from a delivered
    // event, which is how a dead realtime layer stays invisible.
    console.warn("[realtime] not configured — event dropped", { room, host: !!host, secret: !!secret });
    return;
  }

  // The room goes in the path RAW, exactly as PartySocket sends it on the
  // client (`partysocket` builds `/parties/<party>/<room>` with no encoding).
  //
  // This used to be `encodeURIComponent(room)`, and every room name contains a
  // colon (`community-channel:<id>`, `dm:<id>`, `inbox:<id>`), so the publisher
  // addressed `community-channel%3A<id>` while every subscriber sat in
  // `community-channel:<id>`. Those are DIFFERENT Durable Objects. The worker
  // happily created the encoded one, accepted the event, and returned 200 with
  // nobody connected — so every server→client realtime publish in the app
  // silently went nowhere, with no error anywhere to show for it.
  //
  // Verified 2026-08-09 against the deployed worker with a real subscriber:
  // encoded → HTTP 200, 0 frames delivered; raw → HTTP 200, frame delivered.
  //
  // Room names come from `rooms.*`, which interpolate ids into fixed prefixes.
  // A `/` or `?` would still break the path, so guard rather than trust.
  if (/[/?#]/.test(room)) {
    console.error("[realtime] refusing to publish to unsafe room name", room);
    return;
  }

  const url = `https://${host}/parties/${PARTY}/${room}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-realtime-secret": secret },
      body: JSON.stringify(event),
    });
    // Status was previously ignored, which is why the bug above had no signal:
    // a rejected publish (rotated secret, bad room) looked exactly like a
    // delivered one. Still best-effort — log, never throw into the mutation.
    if (!res.ok) {
      console.error("[realtime] publish rejected", room, res.status, (await res.text()).slice(0, 200));
    }
  } catch (err) {
    console.error("[realtime] publish failed", room, err);
  }
}
