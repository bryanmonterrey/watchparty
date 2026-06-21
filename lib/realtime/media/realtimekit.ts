/**
 * Cloudflare RealtimeKit (WebRTC SFU) — server helpers for live audio in Spaces.
 *
 * Two REST calls: create a meeting (once per space) and add a participant
 * (per join) to mint a client `authToken`. The browser joins the SFU directly
 * with that token; this server code only provisions.
 *
 * Gated on env — `isMediaEnabled()` is false until the RealtimeKit app is
 * provisioned, so Spaces still work (roster/chat) without voice. See
 * docs/realtimekit-setup.md.
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const APP_ID = process.env.CLOUDFLARE_REALTIME_APP_ID;
const API_TOKEN = process.env.CLOUDFLARE_REALTIME_API_TOKEN;

/** RealtimeKit presets (configured in the CF dashboard) mapped from space roles. */
export const REALTIMEKIT_PRESETS = {
  /** HOST / SPEAKER — may publish audio. */
  speaker: process.env.REALTIMEKIT_PRESET_HOST ?? "group_call_host",
  /** LISTENER — receive-only. */
  listener: process.env.REALTIMEKIT_PRESET_LISTENER ?? "group_call_participant",
} as const;

export function isMediaEnabled(): boolean {
  return !!(ACCOUNT_ID && APP_ID && API_TOKEN);
}

const base = () =>
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/realtime/kit/${APP_ID}`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${API_TOKEN}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success?: boolean; data?: T; result?: T; errors?: unknown } & Record<string, unknown>;
  if (!res.ok || json.success === false) {
    throw new Error(`RealtimeKit ${path} failed (${res.status}): ${JSON.stringify(json.errors ?? json)}`);
  }
  // RealtimeKit wraps payloads in `data` (CF v4 elsewhere uses `result`).
  return (json.data ?? json.result ?? (json as unknown)) as T;
}

/** Create a meeting; returns its id. Call once per space, then persist the id. */
export async function createMeeting(title: string): Promise<string> {
  const r = await post<{ id?: string; meeting_id?: string }>("/meetings", { title });
  const id = r.id ?? r.meeting_id;
  if (!id) throw new Error("RealtimeKit createMeeting: no meeting id in response");
  return id;
}

/** Add a participant to a meeting; returns the client auth token. */
export async function addParticipant(
  meetingId: string,
  opts: { name: string; presetName: string; customParticipantId: string },
): Promise<string> {
  const r = await post<{ token?: string; authToken?: string }>(
    `/meetings/${encodeURIComponent(meetingId)}/participants`,
    {
      name: opts.name,
      preset_name: opts.presetName,
      custom_participant_id: opts.customParticipantId,
    },
  );
  const token = r.token ?? r.authToken;
  if (!token) throw new Error("RealtimeKit addParticipant: no auth token in response");
  return token;
}
