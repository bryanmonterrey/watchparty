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
/**
 * What a line is replying to, as resolved by the DO.
 *
 * The sender only wires up the target's id — the name and excerpt are looked up
 * server-side in room history, so a client can't put words in someone else's
 * mouth by hand-crafting the quote. Excerpt is already truncated here; the UI
 * renders it as-is.
 */
export type ChatReply = { id: string; name: string; text: string };

/** One stream/channel chat line as stamped by the DO. */
export type ChatLine = {
  id: string;
  userId: string;
  name: string;
  text: string;
  ts: number;
  replyTo?: ChatReply;
};

export type ServerEvent =
  | { t: "presence"; users: PresenceUser[] }
  | { t: "typing"; userId: string; userName: string; channelId?: string }
  | { t: "stop-typing"; userId: string; channelId?: string }
  | { t: "message"; payload: unknown }
  | { t: "event"; name: string; payload: unknown }
  // Live stream chat: identity stamped by the DO (not spoofable).
  | ({ t: "chat" } & ChatLine)
  // One-shot replay of recent lines, sent only to a just-joined connection
  // (stream-chat rooms keep the last CHAT_HISTORY_MAX in DO storage).
  | { t: "chat-history"; lines: ChatLine[] }
  // Answer to a `members` request. Sent to the ASKING connection only — a
  // stream-chat room skips continuous presence on purpose (broadcasting a
  // roster on every join and leave is O(N^2) at fan-out), so the roster is
  // pulled when someone opens it rather than pushed to everyone forever.
  | { t: "members"; users: PresenceUser[] };

/** Messages a client sends UP to the room. Relayed to peers; never persisted. */
export type ClientMessage =
  | { t: "typing"; channelId?: string }
  | { t: "stop-typing"; channelId?: string }
  | { t: "event"; name: string; payload: unknown }
  // Send a live stream chat line; the DO stamps sender + id + ts, and resolves
  // `replyTo` (the id of the line being answered) against room history.
  | { t: "chat"; text: string; replyTo?: string }
  // "Who's in here?" — answered once, to the asker.
  | { t: "members" };

/** Max length the DO enforces on a stream chat line. */
export const CHAT_MAX_LEN = 500;

/** How many chat lines a stream-chat room replays to joiners. */
export const CHAT_HISTORY_MAX = 50;

/** How much of the quoted line a reply carries. One line's worth in the rail. */
export const CHAT_REPLY_EXCERPT = 60;

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
