/**
 * A deadline on every upstream the asset layer talks to.
 *
 * `fetch` has NO default timeout — not in Node, not in workerd. A provider
 * that accepts the connection and then goes quiet holds the request open
 * indefinitely, and `wallet.getAllChainAssets` awaits its providers, so one
 * silent upstream hangs the whole aggregate. tRPC never answers, the query
 * never settles, and `isLoading` stays true: the wallet drawer sits in its
 * balance skeleton forever, which is exactly how this was reported
 * (2026-08-21). An error would have been fine — the callers all fall back —
 * but a promise that never settles has nothing to fall back FROM.
 *
 * 8 seconds: past the slowest healthy call measured here (Alchemy's batched
 * Portfolio scan across ~8 networks) and well inside how long anyone will
 * watch a skeleton before deciding the app is broken.
 */
export const ASSET_FETCH_TIMEOUT_MS = 8_000;

/**
 * `fetch` with the deadline attached. Aborting REJECTS, so every caller's
 * existing catch/`Promise.allSettled` path is what handles it — a timed-out
 * chain reports as unreachable rather than as a chain holding nothing, which
 * is the distinction `getAllChainAssets` already draws between `failed` and
 * an empty list.
 *
 * Pass `signal` in `init` only if you have your own; it wins, and then the
 * deadline is yours to enforce.
 */
export function fetchWithDeadline(
  input: string | URL | Request,
  init: RequestInit = {},
  ms: number = ASSET_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(ms) });
}
