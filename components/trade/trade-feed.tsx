"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { TokenColumn } from "./token-column";
import { TokenColumnHeader } from "./token-column-header";
import { SettingsIcon } from "../icons";
import { trpc } from "@/lib/trpc/client";
import { getRealtimeClient, authenticateRealtimeClient } from "@/lib/supabase/realtime-client";
import { useQuickBuy } from "@/hooks/use-quick-buy";
import { GooDropdown, gooMenuItem, GOO_TRIGGER_PILL, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { CHAIN_OPTIONS, type TradeChain } from "./chains";
import { collapseCopycats } from "./collapse-copycats";
import {
    MemescopeFilterDialog,
    applyMemescopeFilters,
    filtersActive,
    NO_FILTERS,
    DEFAULT_FILTERS,
    type MemescopeFilters,
} from "./memescope-filter-dialog";
import type { TokenStatus, TradeToken } from "./types";

const EMPTY: Record<TokenStatus, TradeToken[]> = { new: [], migrating: [], migrated: [] };

/** On-curve past this = the Migrating column ("final stretch"); under it the
 *  coin is still a fresh launch and lives in New. Matches the ring's own
 *  near-migration color flip at 80. */
const FINAL_STRETCH_AT = 70;

/** The sticky header's height: 52px app-header spacer + 12px gap + 52px for the
 *  single labels-and-controls row. The columns' top pusher must match or rows
 *  start underneath the glass.
 *
 *  Was 168 when the controls had a row of their own; folding them into the last
 *  column header removed that row (h-11 = 44px) and its gap (12px). */
const HEADER_PUSH_PX = 112;

export function TradeFeed() {
    const utils = trpc.useUtils();
    const { quickBuy, buyingId, amountSol } = useQuickBuy();
    // Solana, and no "all chains" option for now. All-chains fanned one
    // chainFeed query out per chain in CHAIN_OPTIONS — seven cached calls to
    // fill three columns — and the board reads as one market, not seven
    // interleaved ones. Restoring it is re-adding the menu item and the
    // `chain === "all"` branches below; the queries already key per chain.
    const [chain, setChain] = useState<TradeChain>("solana");
    const [filters, setFilters] = useState<MemescopeFilters>(DEFAULT_FILTERS);
    const [filterOpen, setFilterOpen] = useState(false);

    // In-house launches are Solana-only, so this is just the chain check now.
    const wantsInHouse = chain === "solana";
    // Read path is cache-only on the server; refetch is a cheap fallback while
    // the realtime push (below) handles instant updates from the stream worker.
    const { data = EMPTY, isLoading } = trpc.trade.getFeed.useQuery(undefined, {
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
        enabled: wantsInHouse,
    });

    // The chain-wide newest-pairs list per selected chain — ONE list serves all
    // three columns (fresh curves → New, high bonding → Migrating, bonded or
    // plain DEX pairs → Migrated), so "all chains" costs one cached call per
    // chain, not one per column.
    const chainIds = [chain];
    const external = trpc.useQueries((t) =>
        chainIds.map((c) =>
            t.trade.chainFeed({ chain: c, list: "new" }, { staleTime: 60_000, refetchInterval: 120_000 }),
        ),
    );

    // Realtime: the token-stream worker writes cached market data → Postgres
    // change → push to every client. One subscription, no per-user polling.
    useEffect(() => {
        let channel: ReturnType<ReturnType<typeof getRealtimeClient>["channel"]> | null = null;
        let cancelled = false;
        (async () => {
            const client = getRealtimeClient();
            try {
                await authenticateRealtimeClient();
            } catch {
                return; // anon users fall back to the refetch interval
            }
            if (cancelled) return;
            channel = client
                .channel("trade:tokens")
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "tokens" },
                    () => utils.trade.getFeed.invalidate()
                )
                .subscribe();
        })();
        return () => {
            cancelled = true;
            if (channel) getRealtimeClient().removeChannel(channel);
        };
    }, [utils]);

    // Merge in-house launches with the chain-wide pairs, dedupe by mint with
    // in-house winning (it knows the creator/live state), then split by
    // lifecycle. Cheap enough to run per render — a few hundred rows.
    const inHouse = wantsInHouse ? data : EMPTY;
    const inHouseMints = new Set(
        [...inHouse.new, ...inHouse.migrating, ...inHouse.migrated]
            .map((t) => t.tokenAddress)
            .filter(Boolean),
    );
    const externalRows = external
        .flatMap((q) => q.data?.tokens ?? [])
        .filter((t) => !inHouseMints.has(t.tokenAddress));
    const byNewest = (a: TradeToken, b: TradeToken) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
    // Copycat collapse runs AFTER the filters: if the strongest copy gets
    // filtered out, a surviving copy should still represent the name.
    const columns: Record<TokenStatus, TradeToken[]> = {
        new: collapseCopycats(applyMemescopeFilters(
            [
                ...inHouse.new,
                ...externalRows.filter((t) => t.status === "migrating" && t.bondingProgress < FINAL_STRETCH_AT),
            ].sort(byNewest),
            filters,
        )),
        migrating: collapseCopycats(applyMemescopeFilters(
            [
                ...inHouse.migrating,
                ...externalRows.filter((t) => t.status === "migrating" && t.bondingProgress >= FINAL_STRETCH_AT),
            ].sort((a, b) => b.bondingProgress - a.bondingProgress),
            filters,
        )),
        migrated: collapseCopycats(applyMemescopeFilters(
            [...inHouse.migrated, ...externalRows.filter((t) => t.status === "migrated")].sort(byNewest),
            filters,
        )),
    };
    // Skeletons only while NOTHING has answered. This was `some(isLoading)`,
    // which let one hung chain (bnb, 2026-08-06 — upstream hangs minutes on
    // prod) hold every column in skeletons forever. Whatever has arrived
    // renders; slow chains stream in when (if) they land.
    const anyAnswer = (wantsInHouse && !isLoading) || external.some((q) => q.data != null);
    const loading = !anyAnswer && ((wantsInHouse && isLoading) || external.some((q) => q.isLoading));

    const activeChain = CHAIN_OPTIONS.find((c) => c.id === chain);
    const openFilter = () => setFilterOpen(true);
    const active = filtersActive(filters);

    return (
        // h-svh, NOT h-full: every ancestor up to the app scroller is
        // auto-height, so 100% resolves to CONTENT height — which is just the
        // sticky header (~180px), and the columns' absolute inset-0 +
        // overflow-hidden box clipped every row out of view (the "counts are
        // non-zero but no coins show" bug). A definite viewport height makes
        // inset-0 mean the screen.
        <div className="h-svh relative" style={{ transform: "translateZ(0)" }}>
            {/* FIXED GLASS HEADER */}
            <div className="sticky w-full top-0 left-0 right-0 z-40 flex items-center justify-center flex-col pt-2 pb-0 space-y-3">
                <div className="absolute inset-0 -z-10 pointer-events-none bg-canvas" />
                {/* Spacer clears the app header (logo + menu overlay this row). */}
                <div className="w-full h-[52px]" />
                {/* ONE row: the column labels AND the board controls.
                    The controls ride in the LAST column's header rather than a
                    row of their own — that keeps the labels in the same
                    full-width `grid-cols-3` as the columns beneath them, so
                    each label stays over its own column. A separate
                    right-aligned row would have squeezed the label grid and
                    floated the labels off their columns.

                    ONE filter button for the board rather than one per column:
                    the dialog it opens has always applied to all three at once
                    (`applyMemescopeFilters` runs over every column), so three
                    identical triggers were three ways to open the same thing.
                    Filter sits LEFT of the chain picker: chain is the coarser
                    choice and reads as the anchor on the edge. */}
                <div className="flex-1 w-full grid grid-cols-3 gap-1 px-2">
                    <TokenColumnHeader status="new" tokensCount={columns.new.length} />
                    <TokenColumnHeader status="migrating" tokensCount={columns.migrating.length} />
                    <TokenColumnHeader
                        status="migrated"
                        tokensCount={columns.migrated.length}
                        right={
                            <div className="flex items-center gap-2">
                    <button
                        onClick={openFilter}
                        aria-label="Filter coins"
                        className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-soft-gray-10 text-zinc-400 transition-colors hover:bg-soft-gray-15 hover:text-flexwhite"
                    >
                        <SettingsIcon filled className="size-6" />
                        {active && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-lantern" />}
                    </button>
                    <GooDropdown
                        align="start"
                        width={200}
                        gap={8}
                        fill={GOO_PANEL_FILL}
                        triggerAriaLabel="Pick a chain"
                        triggerClassName={GOO_TRIGGER_PILL}
                        trigger={
                            <>
                                {activeChain ? <activeChain.Icon className="size-4" /> : null}
                                {activeChain?.label ?? "Chain"}
                                <HugeiconsIcon icon={ArrowDown01Icon} className="size-6 text-zinc-500" strokeWidth={2} />
                            </>
                        }
                        items={[
                            ...CHAIN_OPTIONS.map((c) =>
                                gooMenuItem({
                                    key: c.id,
                                    label: c.label,
                                    icon: <c.Icon className="size-4" />,
                                    onClick: () => setChain(c.id),
                                    right: chain === c.id
                                        ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} />
                                        : undefined,
                                }),
                            ),
                        ]}
                    />
                            </div>
                        }
                    />
                </div>
            </div>

            <div className="absolute inset-0 grid grid-cols-3 gap-1 px-2 lg:px-2 overflow-hidden">
                {(["new", "migrating", "migrated"] as const).map((status) => (
                    <TokenColumn
                        key={status}
                        status={status}
                        tokens={columns[status]}
                        loading={loading}
                        quickBuy={quickBuy}
                        buyingId={buyingId}
                        amountSol={amountSol}
                        headerPushPx={HEADER_PUSH_PX}
                    />
                ))}
            </div>

            <MemescopeFilterDialog
                open={filterOpen}
                onOpenChange={setFilterOpen}
                filters={filters}
                onApply={setFilters}
            />
        </div>
    );
}

export type { TokenStatus };
