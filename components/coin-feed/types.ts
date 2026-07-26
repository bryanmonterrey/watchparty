import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

// The rail's item type is derived from the router rather than hand-written, so
// adding a column to the SELECTION in server/routers/coinFeed.ts can't silently
// leave the UI reading a field that isn't sent.
type RouterOutput = inferRouterOutputs<AppRouter>;

export type AlertEvent = RouterOutput["coinFeed"]["list"]["items"][number];

/** Client-side filter state — mirrors the router's filter input. */
export type AlertFilters = {
    kinds: AlertEvent["kind"][] | null;   // null = every kind
    networks: string[] | null;            // null = every network
    minTraders: number;
    minUsd: number;
    watchpartyOnly: boolean;
};

export const DEFAULT_FILTERS: AlertFilters = {
    kinds: null,
    networks: null,
    minTraders: 0,
    minUsd: 0,
    watchpartyOnly: false,
};

/** Only send the non-default parts — keeps the tRPC query key stable and short
 *  so an untouched filter panel doesn't fragment the cache. */
export function filtersToInput(f: AlertFilters) {
    return {
        ...(f.kinds?.length ? { kinds: f.kinds } : {}),
        ...(f.networks?.length ? { networks: f.networks } : {}),
        ...(f.minTraders > 0 ? { minTraders: f.minTraders } : {}),
        ...(f.minUsd > 0 ? { minUsd: f.minUsd } : {}),
        ...(f.watchpartyOnly ? { watchpartyOnly: true } : {}),
    };
}

export const filtersAreDefault = (f: AlertFilters) =>
    !f.kinds?.length && !f.networks?.length && f.minTraders === 0 && f.minUsd === 0 && !f.watchpartyOnly;
