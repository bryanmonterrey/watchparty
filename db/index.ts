import * as schema from "./schema";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// Reuse the connection across serverless invocations to avoid cold-start TCP overhead.
// max: 1 is intentional for serverless — each function has its own pool of 1.
// idle_timeout/connect_timeout prevent hanging connections from blocking requests.
//
// Cache the client on globalThis in dev: Turbopack hot-reload re-evaluates this
// module on every change, and without this each reload spins up another max:1
// client that holds a Supabase pooler slot. Those leak until the pooler refuses
// new connections and queries start failing ("Failed query …"). One cached
// client per process avoids the leak; prod makes a fresh client per instance.
const globalForDb = globalThis as unknown as { __pgClient?: ReturnType<typeof postgres> };

const client =
    globalForDb.__pgClient ??
    postgres(process.env.DATABASE_URL!, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false, // Required for Supabase transaction pooler (pgBouncer)
    });

if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });
