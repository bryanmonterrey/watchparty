import "server-only";
import { Redis } from "@upstash/redis";
import type { WebSocket } from "ws";
import {
    CHAT_HISTORY_MAX,
    CHAT_MAX_LEN,
    CHAT_REPLY_EXCERPT,
    DEV_STREAM_PREFIX,
    INBOX_PREFIX,
    type ChatLine,
    type ChatReply,
    type ClientMessage,
    type DevStreamConnection,
    type PinnedMessage,
    type PresenceUser,
    type RealtimeClaims,
    type ServerEvent,
} from "./protocol";

// The realtime layer, on Vercel Functions (app/parties/[party]/[room]/route.ts).
//
// Port of the `Chat` Durable Object that ran on Cloudflare until 2026-10-29
// (realtime/src/server.ts in git history). Same rooms, same protocol, same
// rules — what changed is where state lives:
//
// - A DO was ONE object per room holding every socket, so a broadcast was a
//   loop. A Vercel WebSocket is pinned to whichever function instance accepted
//   it, and a room's sockets are spread over many instances. So every
//   broadcast goes through Redis pub/sub (one pattern subscription per
//   instance), and each instance delivers to the sockets it holds.
// - DO storage (history, pin, dev-stream log) and the DO's in-memory roster
//   (presence) move to Redis keys, because no instance sees the whole room.
// - Connections close at the function's maxDuration (300 s on Hobby).
//   PartySocket reconnects on its own and re-fetches a token each time, so
//   this is a blip, not an outage — but presence must survive instances that
//   die without running close handlers, hence the heartbeat + staleness cut.

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
    // We serialise envelopes ourselves; auto-parsing would turn a chat line
    // that happens to be valid JSON into an object.
    automaticDeserialization: false,
});

const CHANNEL_PREFIX = "rt:ch:";
const key = {
    channel: (room: string) => `${CHANNEL_PREFIX}${room}`,
    history: (room: string) => `rt:hist:${room}`,
    pinned: (room: string) => `rt:pin:${room}`,
    presence: (room: string) => `rt:pres:${room}`,
    devConnections: (room: string) => `rt:devconn:${room}`,
};

// Per-connection chat rate limit: max N lines per window. In memory is right:
// a connection never moves between instances.
const CHAT_RATE_MAX = 5;
const CHAT_RATE_WINDOW_MS = 5000;

// A presence row older than this belongs to a socket whose instance died
// without running its close handler. Heartbeat is well inside it.
const PRESENCE_HEARTBEAT_MS = 60_000;
const PRESENCE_STALE_MS = 150_000;

const CONNECTION_LOG_MAX = 50;

type ConnState = { userId: string; name: string; canChat: boolean };
type Conn = { id: string; room: string; ws: WebSocket; state: ConnState; hits: number[] };
type Envelope = { event: ServerEvent; except?: string };

// ── per-instance socket registry + the one Redis subscription ───────────────

const local = new Map<string, Map<string, Conn>>();
let subscription: ReturnType<Redis["psubscribe"]> | null = null;

function ensureSubscribed() {
    if (subscription) return;
    subscription = redis.psubscribe<string>(`${CHANNEL_PREFIX}*`);
    subscription.on("pmessage", ({ channel, message }) => {
        const room = channel.slice(CHANNEL_PREFIX.length);
        const conns = local.get(room);
        if (!conns?.size) return;
        let env: Envelope;
        try {
            env = (typeof message === "string" ? JSON.parse(message) : message) as Envelope;
        } catch {
            return;
        }
        const frame = JSON.stringify(env.event);
        for (const c of conns.values()) {
            if (c.id !== env.except && c.ws.readyState === c.ws.OPEN) c.ws.send(frame);
        }
    });
    subscription.on("error", (err) => {
        // Drop it so the next connection re-subscribes rather than every
        // socket on this instance silently going deaf.
        console.error("[realtime] subscription failed", err);
        subscription = null;
    });
}

/** Fan an event out to every socket in the room, on every instance. */
export async function broadcast(room: string, event: ServerEvent, except?: string): Promise<void> {
    await redis.publish(key.channel(room), JSON.stringify({ event, except } satisfies Envelope));
}

// ── room helpers ─────────────────────────────────────────────────────────────

const isHighFanout = (room: string) => room.startsWith("stream-chat:");
const isDevStream = (room: string) => room.startsWith(DEV_STREAM_PREFIX);

async function getHistory(room: string): Promise<ChatLine[]> {
    const raw = await redis.lrange<string>(key.history(room), 0, -1);
    return raw.flatMap((s) => {
        try {
            return [JSON.parse(s) as ChatLine];
        } catch {
            return [];
        }
    });
}

async function appendHistory(room: string, line: ChatLine) {
    await redis.pipeline().rpush(key.history(room), JSON.stringify(line)).ltrim(key.history(room), -CHAT_HISTORY_MAX, -1).exec();
}

async function getPinned(room: string): Promise<PinnedMessage | null> {
    const raw = await redis.get<string>(key.pinned(room));
    return raw ? (JSON.parse(raw) as PinnedMessage) : null;
}

/**
 * Turns a target line id into the quote the UI shows. Resolved here from the
 * room's own history rather than trusting the client's copy — that is what
 * stops someone quoting words the other person never said.
 */
async function resolveReply(room: string, id: string | undefined): Promise<ChatReply | undefined> {
    if (!id) return undefined;
    const target = (await getHistory(room)).find((l) => l.id === id);
    if (!target) return undefined;
    const text = target.text.length > CHAT_REPLY_EXCERPT ? `${target.text.slice(0, CHAT_REPLY_EXCERPT).trimEnd()}…` : target.text;
    return { id: target.id, userId: target.userId, name: target.name, text };
}

async function presenceUsers(room: string): Promise<PresenceUser[]> {
    const rows = (await redis.hgetall<Record<string, string>>(key.presence(room))) ?? {};
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const seen = new Map<string, PresenceUser>();
    const stale: string[] = [];
    for (const [connId, raw] of Object.entries(rows)) {
        try {
            const row = JSON.parse(raw) as { userId: string; name: string; ts: number };
            if (row.ts < cutoff) stale.push(connId);
            else seen.set(row.userId, { userId: row.userId, userName: row.name });
        } catch {
            stale.push(connId);
        }
    }
    if (stale.length) void redis.hdel(key.presence(room), ...stale).catch(() => undefined);
    // Sorted, per the protocol's contract — two answers listing the same
    // people must compare equal.
    return [...seen.values()].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

async function touchPresence(c: Conn) {
    await redis.hset(key.presence(c.room), { [c.id]: JSON.stringify({ userId: c.state.userId, name: c.state.name, ts: Date.now() }) });
}

async function broadcastPresence(room: string) {
    // High fan-out rooms (live stream chat) skip presence to avoid O(N²) storms;
    // clients there ask with `members` instead.
    if (isHighFanout(room)) return;
    await broadcast(room, { t: "presence", users: await presenceUsers(room) });
}

// ── dev-stream connection accounting (console Connections page) ─────────────

async function getConnectionLog(room: string): Promise<DevStreamConnection[]> {
    const raw = await redis.get<string>(key.devConnections(room));
    return raw ? (JSON.parse(raw) as DevStreamConnection[]) : [];
}

async function recordConnection(room: string, id: string) {
    const log = [...(await getConnectionLog(room)), { id, connectedAt: Date.now(), disconnectedAt: null }];
    await redis.set(key.devConnections(room), JSON.stringify(log.slice(-CONNECTION_LOG_MAX)));
}

async function recordDisconnect(room: string, id: string) {
    const log = await getConnectionLog(room);
    const row = log.find((c) => c.id === id && c.disconnectedAt === null);
    if (!row) return;
    row.disconnectedAt = Date.now();
    await redis.set(key.devConnections(room), JSON.stringify(log));
}

/** The console's view of a dev-stream room: recent connections, newest first. */
export async function devStreamConnections(room: string) {
    const [log, live] = await Promise.all([getConnectionLog(room), redis.hkeys(key.presence(room))]);
    const active = new Set(live);
    return [...log].reverse().map((c) => ({ ...c, active: c.disconnectedAt === null && active.has(c.id) }));
}

// ── server-side publish (tRPC mutations, webhooks) ───────────────────────────

/**
 * Authoritative server publish. `pin` is a request, not an announcement: tRPC
 * has already checked the caller moderates the channel, but the line's text
 * and author are looked up HERE from history rather than trusted from the
 * caller. A moderator picks which message is pinned, never what it says.
 */
export async function publish(room: string, event: ServerEvent): Promise<{ ok: boolean; status: number }> {
    if (event.t === "pin") {
        let pin: PinnedMessage | null = null;
        if (event.id) {
            const target = (await getHistory(room)).find((l) => l.id === event.id);
            if (!target) return { ok: false, status: 404 };
            pin = { id: target.id, userId: target.userId, name: target.name, text: target.text, pinnedBy: event.by, at: Date.now() };
            await redis.set(key.pinned(room), JSON.stringify(pin));
        } else {
            await redis.del(key.pinned(room));
        }
        await broadcast(room, { t: "pinned", pin });
        return { ok: true, status: 200 };
    }
    await broadcast(room, event);
    return { ok: true, status: 200 };
}

// ── a socket's lifetime ──────────────────────────────────────────────────────

/**
 * Owner-bound rooms belong to exactly one person (inbox, dev-stream). The
 * token proves WHO is connecting but carries nothing about the room, so this
 * is the check that ties the two together — without it anyone signed in could
 * listen to anyone's inbox by guessing a user id.
 */
export function mayJoin(room: string, claims: RealtimeClaims): boolean {
    for (const prefix of [INBOX_PREFIX, DEV_STREAM_PREFIX]) {
        if (room.startsWith(prefix) && claims.sub !== room.slice(prefix.length)) return false;
    }
    return true;
}

export async function attach(ws: WebSocket, room: string, claims: RealtimeClaims): Promise<void> {
    ensureSubscribed();
    // `chat` is only present for gated rooms (stream chat). Absent means the
    // room has no gate, so absent is allowed — see RealtimeClaims.
    const conn: Conn = {
        id: crypto.randomUUID(),
        room,
        ws,
        state: { userId: claims.sub, name: claims.name, canChat: claims.chat !== false },
        hits: [],
    };
    let conns = local.get(room);
    if (!conns) local.set(room, (conns = new Map()));
    conns.set(conn.id, conn);

    const heartbeat = setInterval(() => void touchPresence(conn).catch(() => undefined), PRESENCE_HEARTBEAT_MS);

    ws.on("message", (data, isBinary) => {
        if (isBinary) return;
        void onMessage(conn, data.toString()).catch((err) => console.error("[realtime] message failed", room, err));
    });
    ws.on("close", () => {
        clearInterval(heartbeat);
        conns.delete(conn.id);
        if (!conns.size) local.delete(room);
        void (async () => {
            await redis.hdel(key.presence(room), conn.id);
            if (isDevStream(room)) await recordDisconnect(room, conn.id);
            await broadcastPresence(room);
        })().catch(() => undefined);
    });

    await touchPresence(conn);
    if (isDevStream(room)) await recordConnection(room, conn.id);
    if (isHighFanout(room)) {
        // Stream-chat rooms double as the channel's hangout, so joiners get the
        // last CHAT_HISTORY_MAX lines and the current pin.
        const [lines, pin] = await Promise.all([getHistory(room), getPinned(room)]);
        if (lines.length) ws.send(JSON.stringify({ t: "chat-history", lines } satisfies ServerEvent));
        if (pin) ws.send(JSON.stringify({ t: "pinned", pin } satisfies ServerEvent));
    } else {
        // Directly as well as via the broadcast: on a fresh instance the
        // subscription is still connecting, and the joiner would otherwise
        // miss the one roster that includes them.
        ws.send(JSON.stringify({ t: "presence", users: await presenceUsers(room) } satisfies ServerEvent));
    }
    await broadcastPresence(room);
}

function allowChat(conn: Conn): boolean {
    const now = Date.now();
    conn.hits = conn.hits.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
    if (conn.hits.length >= CHAT_RATE_MAX) return false;
    conn.hits.push(now);
    return true;
}

async function onMessage(conn: Conn, raw: string) {
    let msg: ClientMessage;
    try {
        msg = JSON.parse(raw) as ClientMessage;
    } catch {
        return;
    }
    const { room, state } = conn;
    if (msg.t === "typing") {
        await broadcast(room, { t: "typing", userId: state.userId, userName: state.name, channelId: msg.channelId }, conn.id);
    } else if (msg.t === "stop-typing") {
        await broadcast(room, { t: "stop-typing", userId: state.userId, channelId: msg.channelId }, conn.id);
    } else if (msg.t === "event") {
        await broadcast(room, { t: "event", name: msg.name, payload: msg.payload }, conn.id);
    } else if (msg.t === "members") {
        // Pull, not push: answered for the one person who asked.
        conn.ws.send(JSON.stringify({ t: "members", users: await presenceUsers(room) } satisfies ServerEvent));
    } else if (msg.t === "chat") {
        // Followers-only / subscribers-only, enforced against the SIGNED claim.
        // The UI locks its input too, but that's a courtesy — this is the check.
        if (!state.canChat || !allowChat(conn)) return;
        const text = typeof msg.text === "string" ? msg.text.trim().slice(0, CHAT_MAX_LEN) : "";
        if (!text) return;
        // Identity is stamped from verified connection state — clients can't
        // spoof it. Sent to everyone incl. the sender so all share one order.
        const line: ChatLine = {
            id: crypto.randomUUID(),
            userId: state.userId,
            name: state.name,
            text,
            ts: Date.now(),
            replyTo: await resolveReply(room, msg.replyTo),
        };
        await broadcast(room, { t: "chat", ...line });
        if (isHighFanout(room)) await appendHistory(room, line);
    }
}
