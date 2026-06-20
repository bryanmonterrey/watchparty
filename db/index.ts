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

function createClient(connectionString: string) {
    return postgres(connectionString, {
        max: 5,
        idle_timeout: 20,
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
