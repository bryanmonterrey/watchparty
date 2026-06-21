import {
  Server,
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import { verifyRealtimeToken } from "./auth";
import type { ClientMessage, PresenceUser, ServerEvent } from "../../lib/realtime/protocol";

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
    }
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
