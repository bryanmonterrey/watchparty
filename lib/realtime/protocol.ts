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
export type ChatReply = {
  id: string;
  /** Author of the quoted line, so a reply can paint their name their colour. */
  userId: string;
  name: string;
  text: string;
};

/**
 * The channel's pinned line.
 *
 * Resolved by the DO from room history, not supplied by the pinner — a
 * moderator can choose WHICH message is pinned, but not what it says or who it
 * came from.
 */
export type PinnedMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  /** Display name of the moderator who pinned it. */
  pinnedBy: string;
  at: number;
};

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
  //
  // `users` is ORDERED BY userId, and that's part of the contract rather than
  // an accident of iteration. Callers key caches and queries off this list; an
  // order that wobbles between two answers describing the identical set of
  // people makes the same data look like new data, which quietly turns a poll
  // into a refetch of everything downstream of it.
  | { t: "members"; users: PresenceUser[] }
  // The room's current pin, or null once cleared. Broadcast on change and sent
  // to each joiner, so arriving late still shows what's pinned.
  | { t: "pinned"; pin: PinnedMessage | null }
  // SERVER-SIDE ONLY, and never broadcast as-is: tRPC POSTs this to the room
  // after checking the caller moderates the channel, and the DO turns it into
  // the `pinned` event above by looking the id up in history. It rides in
  // ServerEvent because that's what publishToRoom accepts.
  | { t: "pin"; id: string | null; by: string };

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
  /** @handle — what the DO stamps on chat lines and presence. */
  name: string;
  /**
   * Whether this connection may SEND chat, for the room the token was minted
   * for.
   *
   * The claim is room-scoped, which is what makes followers-only and
   * subscribers-only enforceable at all: chat goes straight to the Durable
   * Object over the socket, and the DO has no database, so it cannot ask
   * whether someone follows a channel. The Next app answers that question once,
   * at connect time, and signs the answer — the DO then trusts a value it can
   * verify rather than one the client asserts.
   *
   * Undefined means "not evaluated", which the DO reads as allowed. Rooms that
   * aren't gated (DMs, communities, spaces) never set it.
   */
  chat?: boolean;
};

/**
 * Prefix of the per-user inbox room. Exported because the DO matches on it to
 * refuse a connection from anyone but the room's owner — a room name is the
 * only thing tying that connection to a user, so both sides need the literal.
 */
export const INBOX_PREFIX = "inbox:";

/** `event` name sent on an inbox room when one of the user's threads moved. */
export const INBOX_CONVERSATION_EVENT = "conversation";

/**
 * Payload of that event. Deliberately just an id: an inbox room says "your
 * list changed, go ask", never what was said. Message content stays in the
 * conversation's own room, end-to-end encrypted.
 */
export type InboxConversationPayload = { conversationId: string };

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
  /**
   * One user's message inbox — where "a thread of yours moved" is delivered
   * while they're anywhere else in the app. A `dm:` room only reaches people
   * who have that conversation open, so without this an incoming DM is
   * invisible until something refetches.
   *
   * Owner-only, enforced in the DO (realtime/src/server.ts).
   */
  inbox: (userId: string) => `${INBOX_PREFIX}${userId}`,
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
