import * as schema from "./schema";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// One drizzle client, two runtimes:
//
// - Cloudflare Workers (prod): the connection string comes from the Hyperdrive
//   binding and a FRESH client is made per request — Workers must not reuse a
//   DB connection across requests (subsequent requests fail). React `cache()`
//   scopes exactly one client to the current request.
// - Everywhere else (next dev, bun scripts): no Hyperdrive binding, so we fall
//   back to DATABASE_URL and reuse a single global client (cached on globalThis
//   so Turbopack hot-reload doesn't leak Supabase pooler slots — see history).
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
const CONNECTION_LOST = /CONNECTION_CLOSED|CONNECTION_ENDED|CONNECTION_DESTROYED/i;

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

function createClient(connectionString: string) {
    const sql = postgres(connectionString, {
        max: 5,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false, // Supabase pooler / Hyperdrive: no prepared statements
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
        const run = (mode?: "values") =>
            Promise.resolve()
                .then(() => attempt(mode))
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

// True only on the Cloudflare Workers runtime (deployed Worker or local
// `wrangler`/`cf:preview` via miniflare). During `next build`, `next dev`, and
// bun scripts this is false — those run in Node and must use DATABASE_URL.
// (Accessing the Hyperdrive binding off-Workers throws an unhandled rejection.)
function onWorkersRuntime(): boolean {
    return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

// Returns the Hyperdrive connection string when running on Workers, else undefined.
function hyperdriveConnectionString(): string | undefined {
    if (!onWorkersRuntime()) return undefined;
    try {
        // Cast until `cf:typegen` regenerates CloudflareEnv with the HYPERDRIVE binding.
        const env = getCloudflareContext().env as { HYPERDRIVE?: { connectionString: string } };
        return env.HYPERDRIVE?.connectionString;
    } catch {
        // Binding unavailable for some reason — fall back to DATABASE_URL.
        return undefined;
    }
}

// Workers path: one client per request (React cache resets between requests).
const getRequestDb = cache((connectionString: string): Db =>
    drizzle(createClient(connectionString), { schema }),
);

// Off-Workers path: one reused client per process.
const globalForDb = globalThis as unknown as { __pgDb?: Db };
function getGlobalDb(): Db {
    return (globalForDb.__pgDb ??= drizzle(createClient(process.env.DATABASE_URL!), { schema }));
}

function resolveDb(): Db {
    const cfConn = hyperdriveConnectionString();
    return cfConn ? getRequestDb(cfConn) : getGlobalDb();
}

export const db = new Proxy({} as Db, {
    get(_target, prop, receiver) {
        return Reflect.get(resolveDb() as object, prop, receiver);
    },
});
