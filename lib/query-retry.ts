/**
 * One definition of "is this worth retrying?".
 *
 * ## Why this exists
 *
 * `components/react-query-provider.tsx` sets an app-wide policy that never
 * retries a 4xx, and the comment there explains what it cost to learn: on
 * 2026-08-08 a dead upstream turned into a connection storm because ~52 polling
 * queries each multiplied 4x, and one user saturated the container's 4,096
 * concurrent-connection ceiling.
 *
 * But `retry: <number>` **replaces** that policy rather than extending it, and
 * 14 call sites were doing exactly that. Their intent was always "survive a
 * dropped request" — a real problem here, since production drops a small share
 * of requests on worker memory — and never "ask a 404 four times". Passing a
 * bare number silently opted each of them back into the behaviour the app-wide
 * policy exists to prevent.
 *
 * `hooks/use-auth-session.ts` is the proof it matters: `retry: 2` there was
 * retrying better-auth's **429**, spending the very budget that produced it —
 * three requests per rejection — and 24.8% of session reads were failing.
 *
 * ## Usage
 *
 *     import { retryTransient } from "@/lib/query-retry";
 *     useQuery(..., { retry: retryTransient(3) })
 *
 * Same shape as `retry: 3`, minus the foot-gun.
 */

/**
 * Pull an HTTP status off whatever error shape the caller has.
 *
 * tRPC puts it on `error.data.httpStatus`; better-auth and `@better-fetch/fetch`
 * put it on `error.status`. Checking only one is how a 429 gets mistaken for a
 * dropped connection.
 */
export function httpStatusOf(error: unknown): number | undefined {
    const status =
        (error as { data?: { httpStatus?: number } })?.data?.httpStatus ??
        (error as { status?: number })?.status;
    return typeof status === "number" ? status : undefined;
}

/** 4xx is an answer, not a hiccup. Asking again cannot change it. */
export function isClientError(error: unknown): boolean {
    const status = httpStatusOf(error);
    return status !== undefined && status >= 400 && status < 500;
}

/**
 * A TanStack `retry` predicate: up to `max` attempts for transient failures,
 * never for a 4xx.
 *
 * @param max attempts AFTER the first, matching `retry: <number>` semantics.
 */
export function retryTransient(max: number) {
    return (failureCount: number, error: unknown): boolean => {
        if (isClientError(error)) return false;
        return failureCount < max;
    };
}
