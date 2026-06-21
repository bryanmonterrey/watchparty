import {
  Server,
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import { verifyRealtimeToken } from "./auth";
import { CHAT_MAX_LEN, type ClientMessage, type PresenceUser, type ServerEvent } from "../../lib/realtime/protocol";

// Per-connection chat rate limit: max N lines per window.
const CHAT_RATE_MAX = 5;
const CHAT_RATE_WINDOW_MS = 5000;

export type Env = {
  Chat: DurableObjectNamespace<Chat>;
  /** Shared HMAC secret — must match the Next app's REALTIME_SECRET. */
  REALTIME_SECRET: string;
};

/** Per-connection state, persisted in the WS attachment (survives hibernation). */
type ConnState = { userId: string; name: string };

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

  async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    const token = new URL(ctx.request.url).searchParams.get("token");
    const claims = token ? await verifyRealtimeToken(token, this.env.REALTIME_SECRET) : null;
    if (!claims) {
      connection.close(4401, "unauthorized");
      return;
    }
    connection.setState({ userId: claims.sub, name: claims.name });
    this.broadcastPresence();
  }

  onClose(connection: Connection<ConnState>) {
    this.chatHits.delete(connection.id);
    this.broadcastPresence();
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
    } else if (msg.t === "chat") {
      if (!this.allowChat(connection.id)) return;
      const text = typeof msg.text === "string" ? msg.text.trim().slice(0, CHAT_MAX_LEN) : "";
      if (!text) return;
      // Identity is stamped from verified connection state — clients can't spoof it.
      // Broadcast to everyone incl. sender so all clients share one authoritative order.
      this.broadcast(
        JSON.stringify({
          t: "chat",
          id: crypto.randomUUID(),
          userId: state.userId,
          name: state.name,
          text,
          ts: Date.now(),
        } satisfies ServerEvent),
      );
    }
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

  /** Authoritative server publish: POST /parties/chat/:room from tRPC. */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    if (request.headers.get("x-realtime-secret") !== this.env.REALTIME_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    let event: ServerEvent;
    try {
      event = (await request.json()) as ServerEvent;
    } catch {
      return new Response("bad request", { status: 400 });
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
      (await routePartykitRequest(request, env as never)) ??
      new Response("Not found", { status: 404 })
    );
  },
};
