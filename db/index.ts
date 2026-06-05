import * as schema from "./schema";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// Reuse the connection across serverless invocations to avoid cold-start TCP overhead.
// max: 1 is intentional for serverless — each function has its own pool of 1.
// idle_timeout/connect_timeout prevent hanging connections from blocking requests.
const client = postgres(process.env.DATABASE_URL!, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Required for Supabase transaction pooler (pgBouncer)
});

export const db = drizzle(client, { schema });
