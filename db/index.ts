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

function createClient(connectionString: string, { perRequest = false } = {}) {
    return postgres(connectionString, {
        // On Workers this client is REQUEST-SCOPED, so `max` is not a pool for
        // the app — it's a multiplier on every request in flight. At 5, a burst
        // of webhook deliveries claimed five connections each and exhausted
        // Hyperdrive's small fixed allowance; once exhausted, every other query
        // in the isolate started failing with `write CONNECTION_CLOSED`,
        // including the `user` lookup that renders /[username]. That is what
        // users saw as React #441 on profile pages — a Server Components render
        // error with nothing to do with profiles.
        //
        // One connection per request makes the ceiling the request concurrency
        // itself. Queries a single request runs in parallel now queue behind
        // each other, which is the right trade: Hyperdrive is the scarce
        // resource, and a slightly slower request beats an unrelated page
        // erroring out.
        max: perRequest ? 1 : 5,
        // A request-scoped client is dead the moment the response is sent;
        // holding its socket for 20s after that keeps a slot nobody can use.
        idle_timeout: perRequest ? 5 : 20,
        connect_timeout: 10,
        prepare: false, // Supabase pooler / Hyperdrive: no prepared statements
    });
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
    drizzle(createClient(connectionString, { perRequest: true }), { schema }),
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
