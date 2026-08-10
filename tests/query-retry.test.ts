import { describe, expect, test } from "bun:test";

import { httpStatusOf, isClientError, retryTransient } from "@/lib/query-retry";

/**
 * The retry predicate is tested because getting it wrong is an availability
 * bug, not a correctness one — and availability bugs only show up under load,
 * which is the worst time to find them.
 *
 * On 2026-08-08 a dead upstream became a connection storm: ~52 polling queries
 * each multiplied 4x and one user saturated the container's 4,096-connection
 * ceiling. On 2026-08-09 `hooks/use-auth-session.ts` was retrying better-auth's
 * **429** twice more, spending the budget that produced it, and 24.8% of
 * session reads were failing.
 *
 * Both are the same shape: retrying an answer that will not change.
 */

/** tRPC's error shape. */
const trpcErr = (httpStatus: number) => ({ data: { httpStatus } });
/** better-auth / @better-fetch/fetch's shape. */
const fetchErr = (status: number) => ({ status });

describe("httpStatusOf", () => {
    test("reads both error shapes", () => {
        // Checking only one is how a 429 gets mistaken for a dropped connection.
        expect(httpStatusOf(trpcErr(404))).toBe(404);
        expect(httpStatusOf(fetchErr(429))).toBe(429);
    });

    test("undefined when there is no status to read", () => {
        expect(httpStatusOf(new Error("network"))).toBeUndefined();
        expect(httpStatusOf(null)).toBeUndefined();
        expect(httpStatusOf(undefined)).toBeUndefined();
        expect(httpStatusOf({ status: "500" })).toBeUndefined(); // string, not number
    });
});

describe("isClientError", () => {
    test("4xx only", () => {
        for (const s of [400, 401, 403, 404, 429, 499]) {
            expect(isClientError(trpcErr(s))).toBe(true);
        }
        for (const s of [200, 302, 500, 502, 503]) {
            expect(isClientError(trpcErr(s))).toBe(false);
        }
    });

    test("an error with no status is NOT a client error", () => {
        // A dropped connection has no status, and it is exactly the case the
        // retry exists for. Defaulting this to `true` would disable retries
        // everywhere and nothing would look broken until requests started
        // failing.
        expect(isClientError(new Error("socket hang up"))).toBe(false);
    });
});

describe("retryTransient", () => {
    test("never retries a 4xx, no matter the budget", () => {
        const retry = retryTransient(3);
        expect(retry(0, trpcErr(404))).toBe(false);
        expect(retry(0, trpcErr(429))).toBe(false);
        expect(retry(0, fetchErr(401))).toBe(false);
    });

    test("retries transient failures up to max, matching `retry: <n>` semantics", () => {
        const retry = retryTransient(3);
        expect(retry(0, trpcErr(500))).toBe(true);
        expect(retry(1, trpcErr(500))).toBe(true);
        expect(retry(2, trpcErr(500))).toBe(true);
        expect(retry(3, trpcErr(500))).toBe(false); // budget spent
    });

    test("retryTransient(1) matches the app-wide default", () => {
        const retry = retryTransient(1);
        expect(retry(0, new Error("dropped"))).toBe(true);
        expect(retry(1, new Error("dropped"))).toBe(false);
        expect(retry(0, trpcErr(403))).toBe(false);
    });

    test("retryTransient(0) never retries", () => {
        const retry = retryTransient(0);
        expect(retry(0, trpcErr(500))).toBe(false);
    });
});
