/**
 * Realtime wire protocol — shared by the Next app (client + tRPC publishers)
 * and the PartyServer Durable Object worker (`realtime/`).
 *
 * Pure, isomorphic types only: NO DOM, Node, or Workers imports. Both the
 * browser bundle and the worker bundle compile against this file.
 */

/** The Durable Object binding (kebab-cased class name → URL `/parties/chat/:room`). */
export const PARTY = "chat" as const;

/** A user present in a room (derived from authenticated connection state). */
export type PresenceUser = { userId: string; userName: string };

/**
 * Events the room (DO) pushes DOWN to connected clients.
 * `message` / `event` are opaque relays — the DO never inspects the payload,
 * so persistence + E2E encryption stay in tRPC, unchanged.
 */
export type ServerEvent =
  | { t: "presence"; users: PresenceUser[] }
  | { t: "typing"; userId: string; userName: string; channelId?: string }
  | { t: "stop-typing"; userId: string; channelId?: string }
  | { t: "message"; payload: unknown }
  | { t: "event"; name: string; payload: unknown };

/** Messages a client sends UP to the room. Relayed to peers; never persisted. */
export type ClientMessage =
  | { t: "typing"; channelId?: string }
  | { t: "stop-typing"; channelId?: string }
  | { t: "event"; name: string; payload: unknown };

/** Short-lived auth token claims minted by the Next app, verified by the DO. */
export type RealtimeClaims = {
  /** user id */
  sub: string;
  /** display name (for presence/typing) */
  name: string;
};

/**
 * Room name builders. One `Chat` DO class, namespaced by purpose so 1 binding
 * serves every surface. Keep these the single source of truth for room ids.
 */
export const rooms = {
  /** Server-wide presence + typing for a community (Discord-style). */
  communityPresence: (serverId: string) => `community-presence:${serverId}`,
  /** Per-channel message stream for a community channel. */
  communityChannel: (channelId: string) => `community-channel:${channelId}`,
  /** A direct-message conversation. */
  dm: (conversationId: string) => `dm:${conversationId}`,
  /** A live stream's chat room (high fan-out). */
  streamChat: (streamId: string) => `stream-chat:${streamId}`,
  /** A live audio Space (stage coordination: roles, raise-hand, presence). */
  space: (spaceId: string) => `space:${spaceId}`,
} as const;

export function parseServerEvent(data: string): ServerEvent | null {
  try {
    const v = JSON.parse(data);
    return v && typeof v === "object" && typeof v.t === "string" ? (v as ServerEvent) : null;
  } catch {
    return null;
  }
}
