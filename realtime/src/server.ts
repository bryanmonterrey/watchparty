import {
  Server,
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import { verifyRealtimeToken } from "./auth";
import { CHAT_MAX_LEN, CHAT_HISTORY_MAX, CHAT_REPLY_EXCERPT, DEV_STREAM_PREFIX, INBOX_PREFIX, type ChatLine, type ChatReply, type ClientMessage, type DevStreamConnection, type PinnedMessage, type PresenceUser, type ServerEvent } from "../../lib/realtime/protocol";

// Per-connection chat rate limit: max N lines per window.
const CHAT_RATE_MAX = 5;
const CHAT_RATE_WINDOW_MS = 5000;

export type Env = {
  Chat: DurableObjectNamespace<Chat>;
  /** Shared HMAC secret — must match the Next app's REALTIME_SECRET. */
  REALTIME_SECRET: string;
};

/** Per-connection state, persisted in the WS attachment (survives hibernation). */
type ConnState = { userId: string; name: string; canChat: boolean };

/**
 * `Chat` is the single realtime room class for every surface — community
 * channels, DMs, stream chat, spaces — namespaced by room name
 * (see `rooms` in `lib/realtime/protocol.ts`).
 *
 * Responsibilities:
 *  - Authenticate each connection from a short-lived token.
 *  - Track presence (who's connected) and broadcast the roster on join/leave.
 *  - Relay ephemeral client messages (typing, generic events) to peers.
 *  - Fan out authoritative server events (persisted messages) received over
 *    HTTP from tRPC mutations (`lib/realtime/publish.ts`).
 *
 * It never persists app data — Postgres (via tRPC) stays the source of truth.
 */
export class Chat extends Server<Env> {
  static options = { hibernate: true };

  /** Best-effort per-connection chat throttle (in-memory; resets on hibernation). */
  private chatHits = new Map<string, number[]>();

  /** High fan-out rooms (live stream chat) skip per-viewer presence to avoid O(N²) storms. */
  private get isHighFanout(): boolean {
    return this.name.startsWith("stream-chat:");
  }

  /**
   * Stream-chat rooms double as the channel's persistent hangout (the profile
   * page joins the same room), so the last CHAT_HISTORY_MAX lines live in DO
   * storage and get replayed to each joiner — Kick-style, the room doesn't
   * feel empty on arrival. In-memory cache avoids a storage read per line.
   */
  private historyCache: ChatLine[] | null = null;
  private pinnedCache: PinnedMessage | null | undefined;

  private async getHistory(): Promise<ChatLine[]> {
    if (this.historyCache) return this.historyCache;
    this.historyCache = (await this.ctx.storage.get<ChatLine[]>("chat-history")) ?? [];
    return this.historyCache;
  }

  private async appendHistory(line: ChatLine) {
    const history = [...(await this.getHistory()), line].slice(-CHAT_HISTORY_MAX);
    this.historyCache = history;
    await this.ctx.storage.put("chat-history", history);
  }

  async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    const token = new URL(ctx.request.url).searchParams.get("token");
    const claims = token ? await verifyRealtimeToken(token, this.env.REALTIME_SECRET) : null;
    if (!claims) {
      connection.close(4401, "unauthorized");
      return;
    }
    // Owner-bound rooms belong to exactly one person (inbox, dev-stream). The
    // token proves WHO is connecting but carries nothing about the room, so
    // this is the join that ties the two together — without it anyone signed
    // in could listen to anyone's inbox (or event stream) by guessing a user
    // id. Comparing here (rather than at mint time) is what makes it
    // enforcement: the room name is in the URL the client chose, and this is
    // the only place both are known.
    for (const prefix of [INBOX_PREFIX, DEV_STREAM_PREFIX]) {
      if (this.name.startsWith(prefix) && claims.sub !== this.name.slice(prefix.length)) {
        connection.close(4403, "forbidden");
        return;
      }
    }
    // `chat` is only present for gated rooms (stream chat). Absent means the
    // room has no gate, so absent is allowed — see RealtimeClaims.
    connection.setState({ userId: claims.sub, name: claims.name, canChat: claims.chat !== false });
    if (this.isDevStream) void this.recordConnection(connection.id);
    if (this.isHighFanout) {
      const lines = await this.getHistory();
      if (lines.length) {
        connection.send(JSON.stringify({ t: "chat-history", lines } satisfies ServerEvent));
      }
      // A pin outlives any one session, so joiners are told about it too —
      // otherwise it would only exist for whoever happened to be watching when
      // a moderator set it.
      const pin = await this.getPinned();
      if (pin) connection.send(JSON.stringify({ t: "pinned", pin } satisfies ServerEvent));
    }
    this.broadcastPresence();
  }

  onClose(connection: Connection<ConnState>) {
    this.chatHits.delete(connection.id);
    if (this.isDevStream) void this.recordDisconnect(connection.id);
    this.broadcastPresence();
  }

  // ── dev-stream connection accounting ──────────────────────────────────────
  // Ring buffer of recent connections in DO storage, surfaced to the console
  // Connections page via the authed GET below. Only dev-stream rooms pay for
  // this — chat/DM rooms churn far too fast to log per-connection rows.

  private get isDevStream(): boolean {
    return this.name.startsWith(DEV_STREAM_PREFIX);
  }

  private connectionsCache: DevStreamConnection[] | null = null;
  private static readonly CONNECTION_LOG_MAX = 50;

  private async getConnectionLog(): Promise<DevStreamConnection[]> {
    if (this.connectionsCache) return this.connectionsCache;
    this.connectionsCache = (await this.ctx.storage.get<DevStreamConnection[]>("dev-connections")) ?? [];
    return this.connectionsCache;
  }

  private async putConnectionLog(log: DevStreamConnection[]) {
    this.connectionsCache = log.slice(-Chat.CONNECTION_LOG_MAX);
    await this.ctx.storage.put("dev-connections", this.connectionsCache);
  }

  private async recordConnection(id: string) {
    const log = await this.getConnectionLog();
    await this.putConnectionLog([...log, { id, connectedAt: Date.now(), disconnectedAt: null }]);
  }

  private async recordDisconnect(id: string) {
    const log = await this.getConnectionLog();
    const row = log.find((c) => c.id === id && c.disconnectedAt === null);
    if (row) {
      row.disconnectedAt = Date.now();
      await this.putConnectionLog(log);
    }
  }

  onMessage(connection: Connection<ConnState>, message: WSMessage) {
    if (typeof message !== "string") return;
    const state = connection.state;
    if (!state) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    if (msg.t === "typing") {
      this.relay({ t: "typing", userId: state.userId, userName: state.name, channelId: msg.channelId }, connection.id);
    } else if (msg.t === "stop-typing") {
      this.relay({ t: "stop-typing", userId: state.userId, channelId: msg.channelId }, connection.id);
    } else if (msg.t === "event") {
      this.relay({ t: "event", name: msg.name, payload: msg.payload }, connection.id);
    } else if (msg.t === "members") {
      // Pull, not push. High-fan-out rooms skip presence broadcasts entirely
      // (see broadcastPresence), so this walks the connections once for the one
      // person who asked instead of telling everyone on every join.
      const seen = new Map<string, PresenceUser>();
      for (const c of this.getConnections<ConnState>()) {
        const st = c.state;
        if (st) seen.set(st.userId, { userId: st.userId, userName: st.name });
      }
      // Sorted, per the protocol's contract. getConnections() yields whatever
      // order the socket map happens to be in, which can differ between two
      // answers listing the identical people.
      const users = [...seen.values()].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
      connection.send(JSON.stringify({ t: "members", users } satisfies ServerEvent));
    } else if (msg.t === "chat") {
      // Followers-only / subscribers-only, enforced against the SIGNED claim
      // rather than anything the client sent. The UI locks its input too, but
      // that's a courtesy — this is the check that counts, and it's why the
      // token is minted per room.
      if (!state.canChat) return;
      if (!this.allowChat(connection.id)) return;
      const text = typeof msg.text === "string" ? msg.text.trim().slice(0, CHAT_MAX_LEN) : "";
      if (!text) return;
      // Identity is stamped from verified connection state — clients can't spoof it.
      // Broadcast to everyone incl. sender so all clients share one authoritative order.
      const line: ChatLine = {
        id: crypto.randomUUID(),
        userId: state.userId,
        name: state.name,
        text,
        ts: Date.now(),
        replyTo: this.resolveReply(msg.replyTo),
      };
      this.broadcast(JSON.stringify({ t: "chat", ...line } satisfies ServerEvent));
      if (this.isHighFanout) void this.appendHistory(line);
    }
  }

  /**
   * Turns a target line id into the quote the UI shows.
   *
   * Read from the in-memory history cache rather than storage because
   * onMessage is synchronous and this is decoration — a reply to a line that
   * has already aged out of the last CHAT_HISTORY_MAX simply sends flat rather
   * than blocking the message. Resolving here (not trusting the client's copy)
   * is what stops someone quoting words the other person never said.
   */
  private resolveReply(id: string | undefined): ChatReply | undefined {
    if (!id) return undefined;
    const target = this.historyCache?.find((l) => l.id === id);
    if (!target) return undefined;
    const text = target.text.length > CHAT_REPLY_EXCERPT
      ? `${target.text.slice(0, CHAT_REPLY_EXCERPT).trimEnd()}…`
      : target.text;
    return { id: target.id, userId: target.userId, name: target.name, text };
  }

  private async getPinned(): Promise<PinnedMessage | null> {
    if (this.pinnedCache !== undefined) return this.pinnedCache;
    this.pinnedCache = (await this.ctx.storage.get<PinnedMessage>("pinned")) ?? null;
    return this.pinnedCache;
  }

  private async setPinned(pin: PinnedMessage | null) {
    this.pinnedCache = pin;
    if (pin) await this.ctx.storage.put("pinned", pin);
    else await this.ctx.storage.delete("pinned");
  }

  /** Builds a pin from a line in history. Null when the line has aged out. */
  private resolvePin(id: string, by: string): PinnedMessage | null {
    const target = this.historyCache?.find((l) => l.id === id);
    if (!target) return null;
    return { id: target.id, userId: target.userId, name: target.name, text: target.text, pinnedBy: by, at: Date.now() };
  }

  private allowChat(id: string): boolean {
    const now = Date.now();
    const hits = (this.chatHits.get(id) ?? []).filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (hits.length >= CHAT_RATE_MAX) {
      this.chatHits.set(id, hits);
      return false;
    }
    hits.push(now);
    this.chatHits.set(id, hits);
    return true;
  }

  /** Authoritative server publish: POST /parties/chat/:room from tRPC.
   *  GET (dev-stream rooms only): connection accounting for the console. */
  async onRequest(request: Request): Promise<Response> {
    if (request.headers.get("x-realtime-secret") !== this.env.REALTIME_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    if (request.method === "GET") {
      if (!this.isDevStream) return new Response("not found", { status: 404 });
      const log = await this.getConnectionLog();
      // Live socket ids, so the console can mark rows Active even if a
      // hibernation wiped in-memory state between then and now.
      const active = new Set<string>();
      for (const c of this.getConnections()) active.add(c.id);
      return Response.json({
        connections: [...log].reverse().map((c) => ({
          ...c,
          active: c.disconnectedAt === null && active.has(c.id),
        })),
      });
    }
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    let event: ServerEvent;
    try {
      event = (await request.json()) as ServerEvent;
    } catch {
      return new Response("bad request", { status: 400 });
    }
    // `pin` is a request, not an announcement: tRPC has already checked that the
    // caller moderates this channel, but only the DO holds the history, so the
    // line's text and author are looked up HERE rather than trusted from the
    // wire. A moderator picks which message is pinned, never what it says.
    if (event.t === "pin") {
      const pin = event.id ? this.resolvePin(event.id, event.by) : null;
      if (event.id && !pin) return new Response("unknown message", { status: 404 });
      await this.setPinned(pin);
      this.broadcast(JSON.stringify({ t: "pinned", pin } satisfies ServerEvent));
      return new Response("ok");
    }

    this.broadcast(JSON.stringify(event));
    return new Response("ok");
  }

  private relay(event: ServerEvent, exceptId: string) {
    this.broadcast(JSON.stringify(event), [exceptId]);
  }

  private broadcastPresence() {
    if (this.isHighFanout) return;
    const seen = new Map<string, PresenceUser>();
    for (const c of this.getConnections<ConnState>()) {
      if (c.state) seen.set(c.state.userId, { userId: c.state.userId, userName: c.state.name });
    }
    this.broadcast(JSON.stringify({ t: "presence", users: [...seen.values()] } satisfies ServerEvent));
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env as never, {
        // Authenticate at the HTTP/upgrade layer so invalid tokens are rejected
        // with a clean 401 and never open a WebSocket (no dangling sockets).
        onBeforeConnect: async (req: Request) => {
          const token = new URL(req.url).searchParams.get("token");
          const claims = token ? await verifyRealtimeToken(token, env.REALTIME_SECRET) : null;
          if (!claims) return new Response("unauthorized", { status: 401 });
        },
      })) ?? new Response("Not found", { status: 404 })
    );
  },
};
