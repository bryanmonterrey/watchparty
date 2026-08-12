import { DurableObject } from "cloudflare:workers";

/**
 * `Tape` — a Durable Object that holds ONE long-lived WebSocket to Mobula and
 * forwards every trade to the app.
 *
 * ## Why a DO at all
 *
 * A Worker cannot hold a socket open: it exists for the length of a request.
 * A Durable Object can, and is the only primitive on this platform that can.
 *
 * ## Why a socket rather than the Helius webhook it replaces
 *
 * Helius bills **per delivery**, so cost scales with market activity — the one
 * variable we do not control. One trending coin (HOOD, 230,975 txns/day) works
 * out at 6.9M credits/month, seven times an entire free plan, for a single
 * coin. That billing model burned roughly ten API keys.
 *
 * Mobula bills a socket at **1 credit per minute open**, flat: 43,200/month,
 * whether the 50 watched tokens are dead or exploding. Same coverage, a bill
 * that cannot be moved by the market.
 *
 * ## ⚠️ HIBERNATION MUST STAY OFF, and this is the whole trap
 *
 * `Chat` next door sets `static options = { hibernate: true }`, which is right
 * for it: inbound sockets survive hibernation because the runtime holds them
 * and replays events into a fresh instance.
 *
 * An OUTBOUND socket does not. Hibernating evicts the instance that owns the
 * connection to Mobula, the connection dies, and — because Mobula bills by the
 * minute rather than by the event — nothing looks wrong. The tape simply goes
 * quiet while the bill keeps arriving. So this class never opts in, and the
 * alarm below is what keeps it resident: a DO with no in-flight request, no
 * accepted inbound socket and no pending alarm is evicted in about 30 seconds.
 */

/** Heartbeat. Also the eviction guard — see the hibernation note above. */
const ALARM_INTERVAL_MS = 20_000;

/** Mobula's per-organisation cap across eligible WebSocket payloads. */
const MAX_TOKENS = 50;

/** Reconnect backoff. A reconnect loop is a COST bug here, not just a
 *  reliability one: every open minute is billed, so a socket that dies and
 *  reconnects ten times a minute is billed for ten minutes. */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

/** Trades are POSTed in batches rather than one request per trade. */
const FLUSH_INTERVAL_MS = 2_000;
const FLUSH_MAX_BATCH = 100;

export interface TapeEnv {
    Tape: DurableObjectNamespace<Tape>;
    /** Shared HMAC secret — must match the Next app's REALTIME_SECRET. */
    REALTIME_SECRET: string;
    /** Mobula API key. Absent ⇒ this DO stays dormant and costs nothing. */
    MOBULA_API_KEY?: string;
    /** Where to POST batched trades, e.g. https://watchparty.xyz */
    APP_ORIGIN?: string;
}

interface WatchItem {
    blockchain: string;
    address: string;
}

interface TapeState {
    items: WatchItem[];
    /** Set false to park the socket without forgetting the watch list. */
    active: boolean;
}

export class Tape extends DurableObject<TapeEnv> {
    // NO `static options = { hibernate: true }`. See the note above — that is
    // the difference between a working tape and a silent, still-billed one.

    private socket: WebSocket | null = null;
    private connecting = false;
    private failures = 0;
    private pending: unknown[] = [];
    private lastFlush = 0;
    /** Diagnostics — read by GET /state, so "is it actually running" is answerable. */
    private connectedAt: number | null = null;
    private received = 0;
    private forwarded = 0;
    private lastError: string | null = null;

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname.endsWith("/state")) {
            const st = await this.read();
            return Response.json({
                active: st.active,
                items: st.items.length,
                connected: this.socket !== null,
                connectedAt: this.connectedAt,
                received: this.received,
                forwarded: this.forwarded,
                pending: this.pending.length,
                failures: this.failures,
                lastError: this.lastError,
            });
        }

        if (request.method === "POST" && url.pathname.endsWith("/watch")) {
            const body = (await request.json()) as { items?: WatchItem[]; active?: boolean };
            const items = (body.items ?? [])
                .filter((i) => i && typeof i.blockchain === "string" && typeof i.address === "string")
                .slice(0, MAX_TOKENS);
            const next: TapeState = { items, active: body.active !== false };
            await this.ctx.storage.put("state", next);

            // Resubscribe rather than reconnect: the socket is fine, the
            // subscription is what changed, and tearing the connection down
            // would restart the per-minute billing clock for nothing.
            await this.reconcile();
            return Response.json({ ok: true, watching: items.length, active: next.active });
        }

        return new Response("not found", { status: 404 });
    }

    /**
     * The heartbeat, and the reason this DO stays in memory at all.
     *
     * Re-arms unconditionally — including on the error path. An alarm that
     * fails to reschedule is how a background DO dies quietly, and here that
     * failure is invisible from outside because the socket is outbound: no
     * client disconnects, nothing 500s, the tape just stops.
     */
    async alarm(): Promise<void> {
        try {
            await this.reconcile();
            await this.flush();
        } catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
        } finally {
            await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
        }
    }

    private async read(): Promise<TapeState> {
        return (await this.ctx.storage.get<TapeState>("state")) ?? { items: [], active: false };
    }

    /** Bring the socket in line with stored state: connect, subscribe, or park. */
    private async reconcile(): Promise<void> {
        const st = await this.read();

        // Nothing to watch, parked, or no key ⇒ hold no socket. Mobula bills by
        // the minute OPEN, so an idle connection is a standing charge for
        // nothing.
        if (!st.active || st.items.length === 0 || !this.env.MOBULA_API_KEY) {
            this.close("idle");
            return;
        }

        if (!this.socket && !this.connecting) await this.openSocket(st);
        else if (this.socket) this.subscribe(st);

        // Keep the alarm armed even when openSocket() throws.
        if ((await this.ctx.storage.getAlarm()) == null) {
            await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
        }
    }

    // NOT `connect`: DurableObject reserves that name for TCP sockets
    // (`connect(socket: Socket)`), and overriding it with a different
    // signature is a type error rather than a silent shadow.
    private async openSocket(st: TapeState): Promise<void> {
        // Backoff, checked here rather than by sleeping: a DO cannot block, and
        // the alarm is already a 20s tick to retry on.
        const wait = Math.min(RECONNECT_BASE_MS * 2 ** this.failures, RECONNECT_MAX_MS);
        if (this.failures > 0 && Date.now() - (this.connectedAt ?? 0) < wait) return;

        this.connecting = true;
        try {
            // fetch + Upgrade, not `new WebSocket()` — this is the form workerd
            // documents for an OUTBOUND socket from a Worker/DO.
            const res = await fetch("https://api.mobula.io", {
                headers: { Upgrade: "websocket" },
            });
            const ws = res.webSocket;
            if (!ws) throw new Error(`no webSocket on upgrade response (status ${res.status})`);

            ws.accept();
            this.socket = ws;
            this.connectedAt = Date.now();
            this.failures = 0;
            this.lastError = null;

            ws.addEventListener("message", (ev: MessageEvent) => this.onMessage(ev));
            ws.addEventListener("close", () => this.close("remote close"));
            ws.addEventListener("error", () => this.close("socket error"));

            this.subscribe(st);
        } catch (err) {
            this.failures++;
            this.lastError = err instanceof Error ? err.message : String(err);
            this.socket = null;
        } finally {
            this.connecting = false;
        }
    }

    /**
     * `assetMode: true` subscribes by TOKEN rather than by pool — the same unit
     * the Helius watch switched to, and for the same measured reason: a pool is
     * one venue, a token trades on many, and a pool address CHANGES when a coin
     * graduates off its bonding curve, silently zeroing a pool-keyed tape.
     *
     * `filterOutliers` applies Mobula's own dust/manipulation filter, so the
     * tape is not polluted by the wash trades the feed exists to detect.
     */
    private subscribe(st: TapeState): void {
        if (!this.socket) return;
        this.socket.send(
            JSON.stringify({
                type: "fast-trade",
                authorization: this.env.MOBULA_API_KEY,
                payload: {
                    assetMode: true,
                    filterOutliers: true,
                    items: st.items.slice(0, MAX_TOKENS),
                    subscriptionTracking: true,
                },
            }),
        );
    }

    private onMessage(ev: MessageEvent): void {
        try {
            const data = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
            if (!data) return;
            const trades = Array.isArray(data) ? data : (data.data ?? data.trades ?? null);
            if (!Array.isArray(trades) || trades.length === 0) return;
            this.received += trades.length;
            this.pending.push(...trades);
            // Bounded: if the app is unreachable, drop the OLDEST rather than
            // growing without limit. A DO holds this in memory, and the tape is
            // a live feed — stale trades are worth less than staying alive.
            if (this.pending.length > FLUSH_MAX_BATCH * 10) {
                this.pending = this.pending.slice(-FLUSH_MAX_BATCH * 10);
            }
            if (this.pending.length >= FLUSH_MAX_BATCH || Date.now() - this.lastFlush > FLUSH_INTERVAL_MS) {
                void this.flush();
            }
        } catch {
            // A malformed frame must never take the socket down.
        }
    }

    /** POST the batch to the app, which owns the DB write (`recordSwaps`). */
    private async flush(): Promise<void> {
        if (this.pending.length === 0) return;
        const origin = this.env.APP_ORIGIN;
        if (!origin) return;

        const batch = this.pending;
        this.pending = [];
        this.lastFlush = Date.now();

        try {
            const res = await fetch(`${origin}/api/webhooks/mobula-trades`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: this.env.REALTIME_SECRET,
                },
                body: JSON.stringify({ trades: batch }),
            });
            if (!res.ok) throw new Error(`app returned ${res.status}`);
            this.forwarded += batch.length;
        } catch (err) {
            this.lastError = err instanceof Error ? err.message : String(err);
            // Put them back at the FRONT so ordering survives a blip, then let
            // the cap in onMessage bound it if the app stays down.
            this.pending = [...batch, ...this.pending].slice(-FLUSH_MAX_BATCH * 10);
        }
    }

    private close(reason: string): void {
        if (!this.socket) return;
        try {
            this.socket.close();
        } catch {
            // Already gone.
        }
        this.socket = null;
        this.connectedAt = null;
        this.lastError = reason;
    }
}
