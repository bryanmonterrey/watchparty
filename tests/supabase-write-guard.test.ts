import { afterEach, describe, expect, test } from "bun:test";

import { assertWritableTarget } from "@/lib/supabase/service-client";
import { projectRef } from "@/lib/supabase/project-ref";

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

    test("a CUSTOM DOMAIN is unknown, not a project called 'cdn'", () => {
        // `.env` uses https://cdn.watchparty.xyz, a Supabase custom domain
        // fronting ugpzuypoyeuiebqbzqcm (confirmed by its `sb-project-ref`
        // response header). The ref is NOT in the hostname.
        //
        // The first version took the leading host label, read that as the
        // project "cdn", and threw "supabase-js targets cdn…" on a setup where
        // BOTH sides were the same production project. A fabricated ref is
        // worse than no ref: it turns "cannot tell" into a confident wrong
        // answer, and this guard blocks writes on that answer.
        set("postgres.ugpzuypoyeuiebqbzqcm:pw@aws-0.pooler.supabase.com:6543/postgres",
            "https://cdn.watchparty.xyz");
        expect(() => assertWritableTarget()).not.toThrow();

        // ...and it must stay unknown even when the DB really is elsewhere:
        // an unrecognised host can never prove a mismatch either.
        set(DEV, "https://cdn.watchparty.xyz");
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

/**
 * `projectRef` directly. The guard's correctness is entirely this function's,
 * and the custom-domain bug lived here rather than in the comparison.
 */
describe("projectRef", () => {
    test("pooler connection string", () => {
        expect(projectRef("postgres.ugpzuypoyeuiebqbzqcm:pw@aws-0-us-west-2.pooler.supabase.com:6543/postgres"))
            .toBe("ugpzuypoyeuiebqbzqcm");
    });

    test("api url, and direct db url", () => {
        expect(projectRef("https://ugpzuypoyeuiebqbzqcm.supabase.co")).toBe("ugpzuypoyeuiebqbzqcm");
        expect(projectRef("postgresql://postgres:pw@db.ugpzuypoyeuiebqbzqcm.supabase.co:5432/postgres"))
            .toBe("ugpzuypoyeuiebqbzqcm");
    });

    test("a custom domain has no ref in it — null, never a guess", () => {
        expect(projectRef("https://cdn.watchparty.xyz")).toBeNull();
        expect(projectRef("https://storage.example.com")).toBeNull();
    });

    test("junk and absent values are null", () => {
        expect(projectRef(undefined)).toBeNull();
        expect(projectRef("")).toBeNull();
        expect(projectRef("not a url")).toBeNull();
    });

    test("the pooler's OWN host never reads as a project", () => {
        // aws-0-us-west-2.pooler.supabase.com is shared infrastructure; only
        // the user part carries the ref. Without the pooler branch this would
        // have to be null rather than "aws-0-us-west-2".
        expect(projectRef("https://aws-0-us-west-2.pooler.supabase.com")).toBeNull();
    });
});
