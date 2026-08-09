import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";

export function useAuthSession() {
    return useQuery({
        queryKey: ["session"],
        queryFn: async () => {
            // The error was being discarded and only `data` returned, so a
            // FAILED request became `null` — indistinguishable from "signed
            // out". Everything downstream believed it: the header offered Sign
            // In to a signed-in user, and the wallet button's auto sign-in
            // fired a signature prompt at one.
            //
            // Throwing instead makes it a query error, which retries and keeps
            // the previous session as `data` rather than replacing it with a
            // wrong answer. A genuine null still returns null — signed out is a
            // real state now that anonymous browsing is on.
            const { data, error } = await authClient.getSession();
            if (error) {
                // Carry the status onto the Error. Throwing a bare message threw
                // it away, and `retry` below cannot tell a 429 from a dropped
                // connection without it — which is how a rate-limit answer was
                // being retried into a worse one.
                const err = new Error(error.message ?? "session request failed") as Error & { status?: number };
                err.status = error.status;
                throw err;
            }
            return data;
        },
        // 30s, not 5 minutes, and it works WITH refetchOnMount below rather
        // than against it — see there.
        staleTime: 30 * 1000,
        // `true` + a SHORT staleTime, not `"always"`.
        //
        // The bug `"always"` was fixing is real and must not come back: a null
        // cached inside the staleTime window reads as "signed out" everywhere
        // downstream, so you sign in and the header still says Sign In until a
        // hard refresh builds a fresh QueryClient. But `"always"` refetches on
        // EVERY mount of ANY of the 94 components that call this hook, and
        // TanStack only dedupes fetches that are actually concurrent — so
        // staggered mounts (navigating, opening a dropdown, rendering rows) each
        // fired their own `/api/auth/get-session`.
        //
        // Measured 2026-08-09: one browser, 894 × 200 and **491 × 429** in 12h —
        // 35% of that user's session reads rejected by better-auth's limiter
        // (`rateLimit: { window: 60, max: 100 }` in lib/auth/server.ts). A 429
        // here is worse than a slow answer: it's an error, and an errored
        // session read is exactly the "signed out" misreport this hook exists to
        // prevent.
        //
        // `true` with a 30s staleTime keeps the guarantee — a wrong null can
        // only survive 30s, and sign-in paths already invalidate `["session"]`
        // explicitly (wallet-connect-modal, wallet-button, wallet-drawer) — while
        // bounding this to at most one request per 30s per tab no matter how
        // many components mount.
        refetchOnMount: true,
        refetchOnWindowFocus: true, // Refetch when window regains focus (e.g. after passkey dialog)
        // A dropped request shouldn't read as signed out — but a 4xx must NOT be
        // retried. The answer will not change, and retrying a 429 spends the
        // very budget that produced it: three requests per rejection, which is
        // how a burst becomes a sustained lockout. Same rule the app-wide client
        // uses (components/react-query-provider.tsx); this query overrode it.
        retry: (failureCount, error) => {
            const status = (error as { status?: number })?.status;
            if (typeof status === "number" && status >= 400 && status < 500) return false;
            return failureCount < 2;
        },
        // Self-heal an errored session read. Without this, a first load whose
        // get-session died (the daily session-refresh WRITE is the one that
        // hits the flaky DB path — see db/index.ts on CONNECTION_CLOSED) sat
        // in error state until a refocus or manual refresh, and the header
        // told a signed-in user to sign in for the whole pageview. Errors are
        // transient here; keep asking until an answer lands, then stop.
        //
        // Backs off on a 4xx for the same reason `retry` does: a 429 that keeps
        // being re-asked every 15 seconds never gets out of the window it is
        // being rejected by. 60s is still well inside a session's lifetime.
        refetchInterval: (query) => {
            const status = (query.state.error as { status?: number } | null)?.status;
            if (!query.state.error) return false;
            return typeof status === "number" && status >= 400 && status < 500 ? 60_000 : 15_000;
        },
    });
}
