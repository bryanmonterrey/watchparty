import { afterEach, describe, expect, test } from "bun:test";

import { assertWritableTarget } from "@/lib/supabase/service-client";

/**
 * The guard that stops a dev run writing production.
 *
 * The dev split overrides `DATABASE_URL` only, so a `.env.local` that redirects
 * drizzle but not supabase-js leaves the app READING dev and WRITING prod. That
 * was the live state on 2026-08-12 — all three `SUPABASE_*` vars present in
 * `.env.local` and all three carrying PRODUCTION values, which is why grepping
 * for the key names reported it fixed.
 *
 * It surfaced once as `encrypted_wallets_user_id_user_id_fk`, and only because
 * that row references `user`. A Storage upload or a profile update would have
 * succeeded silently against production from a laptop.
 *
 * Both directions matter here. A guard that never fires is useless; a guard
 * that fires in production takes the site down.
 */

const DEV = "postgres.hghxcuroaaaaaaaaaaaa:pw@aws-0.pooler.supabase.com:6543/postgres";
const DEV_API = "https://hghxcuroaaaaaaaaaaaa.supabase.co";
const PROD_API = "https://ugpzuypoyeuiebqbzqcm.supabase.co";

const env = { ...process.env };
afterEach(() => {
    process.env = { ...env };
});

const set = (dbUrl: string | undefined, apiUrl: string | undefined, nodeEnv = "development") => {
    process.env.NODE_ENV = nodeEnv;
    if (dbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = dbUrl;
    if (apiUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl;
    delete process.env.SUPABASE_ALLOW_CROSS_PROJECT_WRITE;
};

describe("assertWritableTarget", () => {
    test("refuses when drizzle and supabase-js target different projects", () => {
        set(DEV, PROD_API);
        expect(() => assertWritableTarget()).toThrow(/different database|Refusing/i);
    });

    test("allows a matching dev pair", () => {
        set(DEV, DEV_API);
        expect(() => assertWritableTarget()).not.toThrow();
    });

    test("allows both-production (a laptop pointed entirely at prod is deliberate)", () => {
        set("postgres.ugpzuypoyeuiebqbzqcm:pw@aws-0.pooler.supabase.com:6543/postgres", PROD_API);
        expect(() => assertWritableTarget()).not.toThrow();
    });

    test("NEVER blocks in production — the deployed worker must not be gated by this", () => {
        set(DEV, PROD_API, "production");
        expect(() => assertWritableTarget()).not.toThrow();
    });

    test("honours the explicit escape hatch", () => {
        set(DEV, PROD_API);
        process.env.SUPABASE_ALLOW_CROSS_PROJECT_WRITE = "1";
        expect(() => assertWritableTarget()).not.toThrow();
    });

    test("cannot tell → does not block", () => {
        // No DATABASE_URL is a legitimate context (edge/browser bundles), and
        // guessing there would break writes for no safety gain.
        set(undefined, PROD_API);
        expect(() => assertWritableTarget()).not.toThrow();
        set(DEV, undefined);
        expect(() => assertWritableTarget()).not.toThrow();
    });

    test("reads the ref from either URL shape Supabase hands out", () => {
        // Pooler connection string vs. https host — the same project must
        // compare equal across both, or the guard fires on a correct setup.
        set(DEV, DEV_API);
        expect(() => assertWritableTarget()).not.toThrow();
        set("postgresql://postgres:pw@db.hghxcuroaaaaaaaaaaaa.supabase.co:5432/postgres", DEV_API);
        expect(() => assertWritableTarget()).not.toThrow();
    });
});
