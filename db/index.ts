import * as schema from "./schema";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// One drizzle client per process, two flavours:
//
// - Vercel (prod, Fluid compute): an instance serves many requests concurrently
//   and lives across them, so it gets ONE pooled client with a statement
//   deadline that recycles the pool if Supavisor wedges (see getPooledDb).
// - Everywhere else (next dev, bun scripts): a plain global client against
//   DATABASE_URL (cached on globalThis so Turbopack hot-reload doesn't leak
//   Supabase pooler slots — see history).
//
// Until 2026-10 production ran on Cloudflare Workers, which needed a FRESH
// client per request (Workers kill sockets reused across requests); that path
// and its Hyperdrive binding went with the move back to Vercel.
//
// All ~40 call sites keep `import { db } from "@/db"`: the exported `db` is a
// Proxy that resolves the right client on each property access.

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Statement-level retry, because `write CONNECTION_CLOSED` is not a query
// failure — it's a socket that died before the statement went out.
//
// Pool exhaustion was the first theory and it was WRONG: capping the
// per-request client at one connection (and reaping it after 5s idle) left the
// rate unchanged — 176 events per 10 min before, 280 after — so the connections
// aren't running out, they're being torn down under us. That happens on Workers
// for reasons no amount of tuning removes: the runtime closes sockets it no
// longer considers part of a live request, Hyperdrive recycles its own, and
// postgres.js can pick one in the instant between "idle" and "closed".
//
// So the fix is to survive it rather than prevent it.
// "This socket has been ended by the other party" is the same event wearing a
// different string — Node's own message when the peer closed the socket, which
// postgres.js surfaces unchanged. It was 30 of the 107 failures in the first
// window after this shipped, and none of them were being retried.
const CONNECTION_LOST =
    /CONNECTION_CLOSED|CONNECTION_ENDED|CONNECTION_DESTROYED|socket has been ended by the other party/i;

function isRetryable(err: unknown, query: string): boolean {
    const message = String((err as { message?: unknown } | null)?.message ?? err);
    if (!CONNECTION_LOST.test(message)) return false;
    // postgres.js prefixes the syscall that failed. "write CONNECTION_CLOSED"
    // means the send itself failed, so Postgres never saw the statement and
    // replaying it can't duplicate anything — safe for writes too.
    if (/^write /i.test(message)) return true;
    // Otherwise the statement may have executed before the connection dropped,
    // so only replay things that can't have side effects.
    return /^\s*(select|with)\b/i.test(query);
}

// A statement that outlives this is not slow, it is stuck: the 2026-08-06
// failure mode was sockets alive-but-unresponsive against Supavisor with no
// client-side timeout to notice. On the container's shared pool a deadline
// miss POISONS the pool — it is ended and the next request builds a fresh one —
// which is the self-heal that was missing then.
const STATEMENT_DEADLINE_MS = 15_000;

class StatementDeadlineError extends Error {
    constructor(query: string) {
        super(`statement exceeded ${STATEMENT_DEADLINE_MS}ms: ${query.slice(0, 80)}`);
        this.name = "StatementDeadlineError";
    }
}

type ClientOptions = { pooled?: boolean; onDeadline?: () => void };

function createClient(connectionString: string, { pooled = false, onDeadline }: ClientOptions = {}) {
    const sql = postgres(connectionString, {
        max: pooled ? 10 : 5,
        idle_timeout: 20,
        // Pooled (Vercel): recycle sockets on a schedule so a connection
        // that Supavisor has silently abandoned cannot be held forever, and
        // give up on a dial fast — a stuck dial used to be a stuck request.
        max_lifetime: pooled ? 60 * 10 : undefined,
        connect_timeout: pooled ? 5 : 10,
        prepare: false, // Supabase transaction pooler: no prepared statements
    });

    // Every drizzle query goes through client.unsafe() — sometimes awaited
    // directly, sometimes via .values() for array-mode rows (see
    // drizzle-orm/postgres-js/session). Wrapping this one method covers every
    // call site in the app without touching any of them.
    //
    // The return value has to keep BOTH shapes, which is why this hands back a
    // thenable with .values() rather than a plain promise: returning
    // `promise.catch(...)` would drop .values() and break every array-mode
    // query. Each mode memoizes, so awaiting twice can't run the query twice.
    const rawUnsafe = sql.unsafe.bind(sql);
    (sql as unknown as { unsafe: unknown }).unsafe = (
        query: string,
        params?: unknown[],
        options?: unknown,
    ) => {
        const attempt = (mode?: "values") => {
            const pending = rawUnsafe(query, params as never, options as never);
            return mode === "values" ? (pending as { values: () => Promise<unknown> }).values() : pending;
        };
        // Deadline only where there is a pool to poison; scripts and dev
        // would rather wait than have their client torn down.
        const guarded = (p: Promise<unknown>) => {
            if (!pooled) return p;
            let timer: ReturnType<typeof setTimeout>;
            const deadline = new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    onDeadline?.();
                    reject(new StatementDeadlineError(query));
                }, STATEMENT_DEADLINE_MS);
            });
            return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
        };
        const run = (mode?: "values") =>
            Promise.resolve()
                .then(() => guarded(Promise.resolve(attempt(mode))))
                .catch((err: unknown) => {
                    if (!isRetryable(err, query)) throw err;
                    // One retry, on a connection postgres.js re-dials for us.
                    // Not a loop: if the second attempt also finds a dead
                    // socket, something is wrong that hammering won't fix.
                    return attempt(mode);
                });

        let plain: Promise<unknown> | undefined;
        let values: Promise<unknown> | undefined;
        const exec = (mode?: "values") =>
            mode === "values" ? (values ??= run("values")) : (plain ??= run());

        return {
            then: (onOk?: never, onErr?: never) => exec().then(onOk, onErr),
            catch: (onErr?: never) => exec().catch(onErr),
            finally: (onEnd?: never) => exec().finally(onEnd),
            values: () => exec("values"),
            execute: () => exec(),
        };
    };

    return sql;
}

const globalForDb = globalThis as unknown as { __pgDb?: Db; __pooledDb?: { db: Db; sql: ReturnType<typeof postgres> } };
function getGlobalDb(): Db {
    return (globalForDb.__pgDb ??= drizzle(createClient(process.env.DATABASE_URL!), { schema }));
}

// The pool came back on 2026-10-04 (then on the container) with what was
// missing on 2026-08-06, when the global pool's sockets wedged silently against
// Supavisor — alive but unresponsive, no client-side timeout — and hung every
// tRPC query: a statement deadline that poisons the pool (ended, rebuilt on the
// next request), a connection lifetime cap, a short dial timeout, and the retry
// above. The alternative, a client per request, cost a TLS dial + auth (~0.5 s)
// before every first statement.
function getPooledDb(): Db {
    if (globalForDb.__pooledDb) return globalForDb.__pooledDb.db;
    const sql = createClient(process.env.DATABASE_URL!, {
        pooled: true,
        onDeadline: () => {
            // Poison: drop the reference first so concurrent requests build a
            // new pool immediately, then end the old one without waiting on
            // the socket that just proved it will not answer.
            const old = globalForDb.__pooledDb;
            globalForDb.__pooledDb = undefined;
            console.error("[db] statement deadline hit — recycling the connection pool");
            void old?.sql.end({ timeout: 1 }).catch(() => undefined);
        },
    });
    globalForDb.__pooledDb = { db: drizzle(sql, { schema }), sql };
    return globalForDb.__pooledDb.db;
}

function resolveDb(): Db {
    // VERCEL is set on every Vercel build AND function; skip the build so
    // static generation doesn't arm deadlines it has no request to recycle for.
    if (process.env.VERCEL && process.env.NEXT_PHASE !== "phase-production-build") return getPooledDb();
    return getGlobalDb();
}

export const db = new Proxy({} as Db, {
    get(_target, prop, receiver) {
        return Reflect.get(resolveDb() as object, prop, receiver);
    },
});
