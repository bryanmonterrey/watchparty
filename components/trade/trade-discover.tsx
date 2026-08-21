"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { SortingState } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { stableHoverColor } from "@/lib/stable-hover-color";
import { trpc } from "@/lib/trpc/client";
import { getRealtimeClient, authenticateRealtimeClient } from "@/lib/supabase/realtime-client";
import { GooDropdown, gooMenuItem, GOO_TRIGGER_PILL, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { Squircle } from "@/components/ui/squircle";
import { DataTable } from "@/components/ui/data-table";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useQuickBuy } from "@/hooks/use-quick-buy";
import { CHAIN_OPTIONS, type TradeChain } from "./chains";
import { collapseCopycats } from "./collapse-copycats";
import { buildTradeColumns, TIMEFRAMES, type Timeframe } from "./trade-columns";
import type { TokenStatus, TradeToken } from "./types";

// Discover: the /trade landing (per the Axiom reference, in watchparty's
// language) — tab pills + sort over ONE full-width token table. Tabs are
// discovery *views* (Trending / Live / Top / New) — lifecycle stages
// (new/migrating/migrated) live on /trade/memescope as columns. "Live" is
// tokens whose creator is streaming on watchparty right now — the native
// counterpart of Axiom's "Pump Live". Every number shown is a real cached
// market column; nothing decorative. (The avatar bonding ring is gone by
// request — migration progress lives in the memescope columns, not here.)

const EMPTY: Record<TokenStatus, TradeToken[]> = { new: [], migrating: [], migrated: [] };

type Tab = "trending" | "surge" | "live" | "top" | "new";

const TABS: { key: Tab; label: string }[] = [
    { key: "trending", label: "Trending" },
    { key: "surge", label: "Surge" },
    { key: "live", label: "Live" },
    { key: "top", label: "Top" },
    { key: "new", label: "New" },
];

// Ids of the sortable columns, plus `newest`, which the New tab uses and no
// column offers. Every other member matches a column id in `trade-columns` —
// the header IS the sort control now that the sort dropdown is hidden.
type SortKey = "volume" | "marketCap" | "price" | "txCount" | "newest";

// Each tab's natural ordering; the sort dropdown can override it afterwards.
const TAB_SORT: Record<Tab, SortKey> = {
    trending: "volume",
    surge: "volume",
    live: "volume",
    top: "marketCap",
    new: "newest",
};

const EMPTY_COPY: Record<Tab, { title: string; hint: string }> = {
    trending: { title: "No coins here yet", hint: "New launches show up the moment they go live." },
    surge: { title: "Nothing surging right now", hint: "Coins with sudden 5-minute momentum land here." },
    live: { title: "No creators live right now", hint: "Coins appear here while their creator is streaming." },
    top: { title: "No coins here yet", hint: "New launches show up the moment they go live." },
    new: { title: "No fresh launches yet", hint: "Brand-new coins land here first." },
};


export function TradeDiscover() {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>("trending");
    // Sorting is TanStack v9 state now (the table is `manualSorting`, so this
    // drives the memo below rather than the row model). Removal is disabled and
    // a tab always seeds one entry, so `sorting[0]` is never empty.
    const [sorting, setSorting] = useState<SortingState>([{ id: "volume", desc: true }]);
    const sort = (sorting[0]?.id ?? "volume") as SortKey;
    const sortDesc = sorting[0]?.desc ?? true;
    const [timeframe, setTimeframe] = useState<Timeframe>("24h");
    const [chain, setChain] = useState<TradeChain>("solana");
    // ON by default. Measured 2026-08-12 against the live solana board: 22 of
    // 97 coins (23%) carry `risky` — top-10 ≥80%, snipers/insiders/bundlers
    // ≥40%, or dev ≥30% — and every one was being shown, because this filter
    // existed and defaulted OFF. That is the "spam in all feeds" complaint.
    //
    // Photon and Axiom both ship their holder-concentration and dev/sniper
    // filters as active defaults rather than opt-in; a discovery surface whose
    // safety net is off until you find the toggle is not protecting anyone.
    // The "Hide risky" toggle that used to sit beside the tabs is hidden by
    // request, so this is now a fixed default rather than a control — the state
    // stays a hook so restoring the button is one line, not a refactor.
    const [hideRisky] = useState(true);
    // `setAmountSol` went with the quick-buy amount pill (also hidden); the
    // amount itself still labels each row's Buy button.
    const { quickBuy, buyingId, amountSol } = useQuickBuy();
    const utils = trpc.useUtils();

    // Narrow viewports drop columns through TanStack's visibility state rather
    // than a `max-md:hidden` class, because a CSS-hidden cell still leaves its
    // `<col>` reserving width — the table would keep a third of the row for
    // three invisible columns.
    const isMd = useMediaQuery("(min-width: 768px)");
    const isLg = useMediaQuery("(min-width: 1024px)");
    const columnVisibility = useMemo(
        () => ({ volume: isMd, price: isLg, txCount: isLg }),
        [isMd, isLg],
    );

    const onSolana = chain === "solana";
    const activeChain = CHAIN_OPTIONS.find((c) => c.id === chain) ?? CHAIN_OPTIONS[0];

    // In-house coins are Solana launches — off Solana the query stays cold and
    // the board is purely the chain-wide feed.
    const { data = EMPTY, isLoading } = trpc.trade.getFeed.useQuery(undefined, {
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
        enabled: onSolana,
    });

    // The chain-wide board (every coin, DexScreener-style). One list per
    // tab-shape: New reads the newest-pairs list, everything else the
    // volume-ranked one. Server caches 90s per chain+list, so the client
    // refetch mostly rides the cache.
    const chainFeed = trpc.trade.chainFeed.useQuery(
        { chain, list: tab === "new" ? "new" : "trending" },
        { refetchInterval: 60_000, staleTime: 30_000 },
    );
    const externalRows = chainFeed.data?.tokens;
    const marketDataOff = chainFeed.data ? !chainFeed.data.enabled : false;

    // Same realtime push as the memescope board: token-stream worker writes →
    // Postgres change → invalidate. `streams` is watched too so the Live tab
    // reacts the moment a creator goes live/offline. Anon users ride the 15s
    // refetch.
    useEffect(() => {
        let channel: ReturnType<ReturnType<typeof getRealtimeClient>["channel"]> | null = null;
        let cancelled = false;
        (async () => {
            const client = getRealtimeClient();
            try {
                await authenticateRealtimeClient();
            } catch {
                return;
            }
            if (cancelled) return;
            channel = client
                .channel("trade:tokens")
                .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, () =>
                    utils.trade.getFeed.invalidate(),
                )
                .on("postgres_changes", { event: "*", schema: "public", table: "streams" }, () =>
                    utils.trade.getFeed.invalidate(),
                )
                .subscribe();
        })();
        return () => {
            cancelled = true;
            if (channel) getRealtimeClient().removeChannel(channel);
        };
    }, [utils]);

    const all = useMemo(
        () => (onSolana ? [...data.new, ...data.migrating, ...data.migrated] : []),
        [data, onSolana],
    );
    const liveCount = all.filter((t) => t.creatorIsLive).length;

    const tokens = useMemo(() => {
        // One board, two sources: in-house launches (Solana only) + the
        // chain-wide feed. Deduped by mint, in-house winning — that row knows
        // its creator, live state and bonding curve; the Mobula one doesn't.
        const inHouseMints = new Set(all.map((t) => t.tokenAddress).filter(Boolean));
        const external = (externalRows ?? []).filter((t) => !inHouseMints.has(t.tokenAddress));
        const merged: TradeToken[] = [...all, ...external];

        const visible = hideRisky ? merged.filter((t) => !t.risky) : merged;
        const base: TradeToken[] =
            // Live is watchparty-native: coins whose creator is streaming here.
            tab === "live" ? all.filter((t) => t.creatorIsLive)
            // Surge = positive 5-minute momentum with real 5-minute volume —
            // external rows carry real 5m windows, so they compete too.
            : tab === "surge" ? visible.filter((t) => (t.changePercent5m ?? 0) > 0 && (t.volume5m ?? 0) > 0)
            : tab === "new" ? ([...(onSolana ? data.new : []), ...external] as TradeToken[]).filter((t) => !hideRisky || !t.risky)
            : visible;
        // Every comparator is written descending; `dir` flips the whole chain
        // when the header is toggled to ascending, so the tab's own tiebreakers
        // invert with it instead of fighting the user's choice.
        const dir = sortDesc ? 1 : -1;
        const by: Record<SortKey, (a: TradeToken, b: TradeToken) => number> = {
            volume: (a, b) => b.volume - a.volume,
            marketCap: (a, b) => b.marketCap - a.marketCap,
            price: (a, b) => b.priceUsd - a.priceUsd,
            txCount: (a, b) => b.txCount - a.txCount,
            newest: (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0),
        };
        return collapseCopycats(base.sort((a, b) => dir * (
            // Live tab: most-watched streams first; Surge: hottest 5m move
            // first, 5m volume as tiebreaker; market sort breaks remaining ties.
            tab === "live" ? b.liveViewerCount - a.liveViewerCount || by[sort](a, b)
            : tab === "surge" ? (b.changePercent5m ?? 0) - (a.changePercent5m ?? 0) || (b.volume5m ?? 0) - (a.volume5m ?? 0)
            : by[sort](a, b)
        )));
    }, [data, all, externalRows, onSolana, tab, sort, sortDesc, hideRisky]);

    const selectTab = (t: Tab) => {
        setTab(t);
        setSorting([{ id: TAB_SORT[t], desc: true }]);
        if (t === "surge") setTimeframe("5m"); // surge reads in 5m terms
    };

    // The columns close over the timeframe and the quick-buy state, so they are
    // rebuilt when either changes and are otherwise stable — a fresh array on
    // every render would re-create the table's column instances each time.
    const columns = useMemo(
        () => buildTradeColumns({ timeframe, quickBuy, buyingId, amountSol }),
        [timeframe, quickBuy, buyingId, amountSol],
    );

    const selectChain = (c: TradeChain) => {
        setChain(c);
        // Live is creators streaming on watchparty — a Solana-only idea.
        if (c !== "solana" && tab === "live") selectTab("trending");
    };

    return (
        // --board-stick is where the board's column labels pin: directly under
        // the sticky control bar above them. MEASURED, and the two halves are
        // the bar's own two boxes — the h-(--header-height) spacer (hidden
        // below md, which is why the base value omits it) plus the 4rem tab
        // row (py-2/pb-3 around a 44px pill). Same hook and same reasoning as
        // home's category tabs; keep it in sync with the bar if that row's
        // padding ever changes.
        <div className="flex h-full flex-col [--board-stick:4rem] md:[--board-stick:calc(var(--header-height)+4rem)]">
            {/* Glass control bar under the fixed header (same pattern as the
                memescope board's sticky header). */}
            <div className="sticky top-0 z-40">
                <div className="pointer-events-none absolute inset-0 -z-10 bg-canvas backdrop-blur-sm" />
                <div className="h-(--header-height) max-md:hidden" />
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-2 lg:px-6">
                    {/* The active pill SLIDES between tabs (shared layoutId)
                        rather than cutting, matching the wallet drawer — same
                        spring, same initial={false} so it doesn't animate in
                        from nothing on first paint. `relative` on the row is
                        what the absolutely-positioned pill measures against. */}
                    <div className="relative flex items-center gap-1.5">
                        {TABS.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => selectTab(t.key)}
                                className={cn(
                                    "relative z-10 flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-lg font-bold tracking-tight transition-colors",
                                    tab === t.key
                                        ? "text-flexwhite"
                                        : "text-zinc-400 hover:bg-white/10 hover:text-white",
                                )}
                            >
                                {tab === t.key && (
                                    <motion.div
                                        layoutId="tradeTabHighlight"
                                        className="absolute inset-0 -z-10 rounded-full bg-sidebar-hover"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 250, damping: 30 }}
                                    />
                                )}
                                {t.key === "live" && liveCount > 0 && (
                                    <span className="relative flex size-2">
                                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-pastelred opacity-75" />
                                        <span className="relative inline-flex size-2 rounded-full bg-pastelred" />
                                    </span>
                                )}
                                {t.label}
                                {t.key === "live" && liveCount > 0 && (
                                    <span className={cn("text-[13px] font-bold tabular-nums", tab === t.key ? "text-black/50" : "text-zinc-600")}>
                                        {liveCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                    {/* Timeframe — drives the % + volume cells */}
                    {/* The active pill slides between timeframes on the wallet
                        drawer's spring, like every other tab strip in the app.
                        `relative` on the track is what the absolutely-positioned
                        pill measures against. */}
                    {/* h-11 on the TRACK, not the buttons. The track carries
                        `p-1`, so an h-11 button made the control 52px — taller
                        than every other button on the row, which are h-11 per
                        the button-height standard. The inner buttons are h-9
                        (44 − 2×4) so the outer measurement is the one that
                        matches. */}
                    <div className="relative flex h-11 items-center rounded-full bg-white/5 p-1">
                        {TIMEFRAMES.map((tf) => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={cn(
                                    "relative z-10 h-9 cursor-pointer rounded-full px-3 text-base font-bold transition-colors",
                                    timeframe === tf ? "text-twitter2" : "text-zinc-400 hover:text-white",
                                )}
                            >
                                {timeframe === tf && (
                                    <motion.div
                                        layoutId="tradeTimeframeHighlight"
                                        className="absolute inset-0 -z-10 rounded-full bg-soft-gray-15"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 250, damping: 30 }}
                                    />
                                )}
                                {tf}
                            </button>
                        ))}
                    </div>


                    {/* Chain picker — which chain the board shows. Every coin
                        on that chain is eligible, DexScreener-style. */}
                    <GooDropdown
                        align="end"
                        width={200}
                        gap={8}
                        fill={GOO_PANEL_FILL}
                        triggerAriaLabel="Pick a chain"
                        triggerClassName={GOO_TRIGGER_PILL}
                        trigger={
                            <>
                                <activeChain.Icon className="size-4" />
                                {activeChain.label}
                                <HugeiconsIcon icon={ArrowDown01Icon} className="size-6 text-zinc-500" strokeWidth={2} />
                            </>
                        }
                        items={CHAIN_OPTIONS.map((c) => gooMenuItem({
                            key: c.id,
                            label: c.label,
                            icon: <c.Icon className="size-4" />,
                            onClick: () => selectChain(c.id),
                            right: chain === c.id
                                ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-white" strokeWidth={2} />
                                : undefined,
                        }))}
                    />

                    </div>
                </div>
            </div>

            {/* Token table — TanStack Table v9 under the beui.dev chrome.
                `manualSorting`: the rows arrive already ordered by the memo
                above (tab tiebreakers and copycat collapsing can't be expressed
                as a column comparator), so the headers set the sort state and
                the memo does the ordering. */}
            <div className="flex-1 px-4 pb-8 lg:px-6">
                <Squircle asChild radius={20} autoEffects={false}>
                    {/* bg-canvas, not a raised sidebar-hover card: the board
                        sits straight on the page like the trending table, so
                        the only thing defining a row is its own hover wash. */}
                    <div className="bg-canvas">
                        <DataTable
                            data={tokens}
                            columns={columns}
                            getRowId={(t) => t.id}
                            sorting={sorting}
                            onSortingChange={setSorting}
                            manualSorting
                            columnVisibility={columnVisibility}
                            rowHeight={76}
                            resizable
                            reorderable
                            // Loading while EITHER source that feeds this board
                            // is still pending — not just the in-house one.
                            //
                            // It was `onSolana ? isLoading : chainFeed.isLoading`,
                            // which flashed the empty state before every load on
                            // Solana: `tokens` merges in-house launches with the
                            // chain-wide feed, and getFeed answers from our own
                            // DB almost immediately (often with zero rows, since
                            // in-house coins are rare) while chainFeed is still
                            // waiting on Mobula. That left rows empty and loading
                            // false, so DataTable did the correct thing with the
                            // wrong inputs and rendered "No coins here yet" until
                            // the real list landed.
                            loading={(onSolana && isLoading) || chainFeed.isLoading}
                            onRowClick={(t) =>
                                router.push(
                                    t.external
                                        ? `/coin/${t.chain}/${t.tokenAddress}`
                                        : `/${t.tokenAddress || t.id}`,
                                )
                            }
                            rowHoverRadius={12}
                            rowHoverColor={(t) => stableHoverColor(t.id)}
                            className="px-2"
                            stickyHeader
                            stickyTop="var(--board-stick,0px)"
                            // bg-canvas, not transparent: stuck, the rows pass
                            // UNDER these labels and a transparent strip lets
                            // them read straight through. The board already
                            // sits on canvas, so the fill is invisible until
                            // it is doing that job.
                            headerClassName="bg-canvas"
                            emptyState={
                                <div className="flex flex-col items-center justify-center gap-1 py-8">
                                    <p className="text-base font-bold text-zinc-400">{EMPTY_COPY[tab].title}</p>
                                    <p className="text-sm text-zinc-600">
                                        {marketDataOff && tab !== "live"
                                            ? "market data isn't connected yet — the board fills in once it is"
                                            : EMPTY_COPY[tab].hint}
                                    </p>
                                </div>
                            }
                        />
                    </div>
                </Squircle>
            </div>
        </div>
    );
}
