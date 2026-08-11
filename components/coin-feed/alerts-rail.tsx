"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BidirectionalList, { type BidirectionalListRef } from "broad-infinite-list/react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUp02Icon, AtIcon, MinusSignIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { alertsSnapshotStore } from "@/lib/snapshot/surfaces";
import { viewerKey, queryInputKey } from "@/lib/snapshot/keys";
import { useSnapshot } from "@/hooks/use-snapshot";
import { getRealtimeClient, authenticateRealtimeClient } from "@/lib/supabase/realtime-client";
import { RailShell } from "@/components/rails/rail-shell";
import { RailScrollbar } from "@/components/rails/rail-scrollbar";
import { AlertRow } from "./alert-row";
import { AlertListSkeleton, AlertRowSkeleton } from "./alert-row-skeleton";
import { AlertFiltersButton, activeFilterSummary } from "./alert-filters";
import { DEFAULT_FILTERS, filtersToInput, type AlertEvent, type AlertFilters } from "./types";
import { retryTransient } from "@/lib/query-retry";

// The coin alert rail — /home's left column.
//
// The SCROLL MACHINERY here is ported from components/browse/browse-feed.tsx
// (the discover feed) and the reasoning carries over verbatim; the differences
// are called out inline. The short version of what it buys us:
//
//   • BidirectionalList is a sliding window over a FULL ordered dataset we keep
//     in a ref. Items evicted off one edge are restored from that dataset when
//     you scroll back, instead of being refetched — so scrolling up is instant
//     and never re-orders under you.
//   • The window's top is PINNED (establishedTopKeyRef). Anything newer than it
//     waits behind the "n new" pill rather than being injected above the row you
//     are looking at. This is the single most important behaviour: an alert feed
//     writes constantly, so without the pin the rail would shift under the
//     cursor every few seconds.
//   • Newer items only fold in automatically when you are already at the top.
//
// The one structural change from discover: useWindow={false}. Discover scrolls
// the page; this rail is a fixed-height sticky column that scrolls INSIDE
// itself, so BidirectionalList owns the scroller (it applies height:100% +
// overflowY:auto to its container).

// ── Tuning ───────────────────────────────────────────────────────────────────
// Rows are ~56px, so 100 items ≈ 5,600px of DOM — comfortably more than a
// session scrolls, which keeps the window from ever trimming (and thus from
// scroll-compensating, which snaps).
const VIEW_COUNT = 100;
// Smaller than discover's 1200: the rail's viewport is one screen tall, and a
// threshold near the scroller's own height would keep the loader permanently
// triggered.
const LOAD_THRESHOLD_PX = 700;
const PAGE_SIZE = 20; // keep in sync with the `limit` on the list query below
const POLL_MS = 25_000;
/** Stand-in for the pill's `since` while the query is disabled. Constant so the
 *  key never changes before there's a real anchor to use. */
const SINCE_PLACEHOLDER = "1970-01-01T00:00:00.000Z";

const keyOf = (e: AlertEvent) => e.id;
const timeOf = (e: AlertEvent) => new Date(e.occurredAt).getTime();

function dedupeNewestFirst(items: AlertEvent[]): AlertEvent[] {
    const seen = new Set<string>();
    const out: AlertEvent[] = [];
    for (const it of items) {
        if (seen.has(keyOf(it))) continue;
        seen.add(keyOf(it));
        out.push(it);
    }
    // Ties on occurredAt are common (a cluster window closes on one block), so
    // id is the tiebreak here exactly as it is in the server's keyset cursor —
    // otherwise the client's order and the cursor's order disagree and
    // pagination duplicates rows at page boundaries.
    return out.sort((a, b) => timeOf(b) - timeOf(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

// Tab names match the router's `scope` values exactly, so the query input is a
// pass-through rather than a mapping.
//
// "following" is gone from the rail. The router still accepts it as a scope —
// only the tab that selected it was removed — so putting it back is adding the
// label to the row below, nothing more.
type RailTab = "alerts" | "mentions";

export function AlertsRail({ className, onCollapse }: { className?: string; onCollapse?: () => void }) {
    const [filters, setFilters] = useState<AlertFilters>(DEFAULT_FILTERS);
    const [tab, setTab] = useState<RailTab>("alerts");
    // The tab is a scope, not a filter — it rides the same query input but is
    // kept out of AlertFilters so it never shows up in the filter summary or
    // lights the filter button's "something is set" dot.
    const filterInput = useMemo(
        () => ({ ...filtersToInput(filters), ...(tab === "alerts" ? {} : { scope: tab }) }),
        [filters, tab],
    );
    const utils = trpc.useUtils();

    // `coinFeed.list` runs buildFilters(input, ctx.user?.id), so the rows depend
    // on the viewer as well as the filters — both belong in the key.
    const { data: railSession } = useAuthSession();
    const alertsSnapshotKey = useMemo(
        () => viewerKey(railSession?.user?.id, "alerts", queryInputKey(filterInput)),
        [railSession?.user?.id, filterInput],
    );

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isLoading,
        isError,
        // A FAILED PAGE IS NOT `isError`. On an infinite query the status stays
        // "success" as long as any page succeeded, so when page 2 started
        // failing, `isError` never flipped, the `hasNext` guard below stayed
        // open, and the list re-asked for the same cursor forever — a permanent
        // request loop on every route that mounts this rail (/home, /feed and
        // /coin since the rails group). This is the flag that actually reports
        // it.
        isFetchNextPageError,
        isPlaceholderData,
        refetch,
    } = trpc.coinFeed.list.useInfiniteQuery(
        { ...filterInput, limit: PAGE_SIZE },
        {
            getNextPageParam: (last) => last.nextCursor,
            staleTime: 30_000,
            // Paint the last page we held for this viewer+filter instead of
            // skeletons. The store's max age is 30 minutes, deliberately short:
            // these are market events, and one old enough to mislead is never
            // painted at all. See lib/snapshot/surfaces.ts.
            placeholderData: () => alertsSnapshotStore.read(alertsSnapshotKey),
            // A rail that sits open for hours will hit the occasional dropped
            // request; back off and recover rather than surfacing the first
            // blip. Errors no longer blank the feed either — see the render.
            retry: retryTransient(3),
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
        },
    );

    // Recover from the error status on our own. Without this it is TERMINAL:
    // an infinite query stays in `error` until a fetch succeeds, `retry: retryTransient(3)` is
    // already spent by the time we get here, and `hasNext` goes false while
    // isError (see the render) so the list stops asking for pages too. The
    // result was the "couldn't refresh" bar sitting there for the rest of the
    // session on a single dropped request — and prod drops a small share of
    // requests on worker memory, so that is a matter of when, not if.
    //
    // The interval is deliberately slow: refetch() on an infinite query
    // refetches EVERY loaded page, so this is not cheap. It unmounts the moment
    // a fetch succeeds, and the manual retry button is still there for anyone
    // who does not want to wait.
    //
    // Covers a failed NEXT page as well, which is now what closes `hasNext` in
    // the render: without it that guard would be permanent for the session and
    // the rail could never paginate again once one page had failed.
    useEffect(() => {
        if (!isError && !isFetchNextPageError) return;
        const id = setInterval(() => void refetch(), 30_000);
        return () => clearInterval(id);
    }, [isError, isFetchNextPageError, refetch]);

    useSnapshot(alertsSnapshotStore, alertsSnapshotKey, data, isPlaceholderData);

    const { data: coverage } = trpc.coinFeed.coverage.useQuery(undefined, { staleTime: 300_000 });

    // ── Window state ─────────────────────────────────────────────────────────
    const listRef = useRef<BidirectionalListRef>(null);
    /** Full ordered dataset (newest-first) — the source the window slices from.
     *  Holds every loaded alert: paginated-older ones plus locally prepended
     *  newer ones. */
    const fullItemsRef = useRef<AlertEvent[]>([]);
    const [listItems, setListItems] = useState<AlertEvent[]>([]);
    /** Bumped to remount the list when the filters change — a new filter set is
     *  a different dataset, and reusing the window would splice them. */
    const [listKey, setListKey] = useState(0);
    const populated = useRef(false);
    /** Key of the feed's ESTABLISHED top: the newest alert present when the rail
     *  loaded, advanced ONLY by the pill. Scrolling up may restore alerts the
     *  user already passed, but must never surface anything above this. */
    const establishedTopKey = useRef<string | null>(null);

    const establishedTopIdx = useCallback((full: AlertEvent[]) => {
        const k = establishedTopKey.current;
        if (!k) return 0;
        const i = full.findIndex((it) => keyOf(it) === k);
        return i < 0 ? 0 : i;
    }, []);

    const feedItems = useMemo(
        () => dedupeNewestFirst(data?.pages.flatMap((p) => p.items) ?? []),
        [data],
    );

    /**
     * What the rail actually renders — and therefore the ONLY correct thing to
     * test for emptiness.
     *
     * `feedItems` is the raw query cache and diverges from the window by
     * design: the pill merges new alerts straight into `listItems` /
     * `fullItemsRef` without going through the query, and BidirectionalList
     * rewrites `listItems` on every trim. Testing `feedItems` for "is this
     * feed empty" meant any moment the cache was empty or being replaced
     * flashed the empty state over a window that still had alerts in it —
     * which is exactly the flicker, and why a new alert could blank the feed.
     */
    const windowItems = useMemo(
        () => dedupeNewestFirst(listItems.length > 0 ? listItems : feedItems.slice(0, VIEW_COUNT)),
        [listItems, feedItems],
    );

    // ── "at the top?" gate ───────────────────────────────────────────────────
    // Discover watches its composer with an IntersectionObserver; this rail has
    // no composer and BidirectionalList owns the scroll element, so we listen on
    // that element directly (exposed as scrollViewRef).
    const [atTop, setAtTop] = useState(true);
    const atTopRef = useRef(true);
    useEffect(() => {
        // The list mounts after this effect's first run on a remount, so poll a
        // couple of frames for the scroller before giving up.
        let raf = 0;
        let el: HTMLElement | null = null;
        const onScroll = () => {
            const next = (el?.scrollTop ?? 0) < 8;
            atTopRef.current = next;
            setAtTop(next);
        };
        const attach = (tries: number) => {
            el = listRef.current?.scrollViewRef.current ?? null;
            if (!el) {
                if (tries > 0) raf = requestAnimationFrame(() => attach(tries - 1));
                return;
            }
            el.addEventListener("scroll", onScroll, { passive: true });
            onScroll();
        };
        attach(10);
        return () => {
            cancelAnimationFrame(raf);
            el?.removeEventListener("scroll", onScroll);
        };
    }, [listKey]);

    // ── Seed / merge the window from the query ───────────────────────────────
    // Pagination of OLDER alerts flows through onLoadMore, not here; this effect
    // only owns the full dataset and the window's top.
    useEffect(() => {
        if (isLoading || feedItems.length === 0) return;

        const feedKeys = new Set(feedItems.map(keyOf));
        const localPrepends = fullItemsRef.current.filter((i) => !feedKeys.has(keyOf(i)));
        const full = dedupeNewestFirst([...localPrepends, ...feedItems]);
        fullItemsRef.current = full;

        if (!populated.current) {
            populated.current = true;
            establishedTopKey.current = full[0] ? keyOf(full[0]) : null;
            setListItems(full.slice(0, VIEW_COUNT));
            return;
        }

        setListItems((prev) => {
            if (prev.length === 0) return full.slice(0, VIEW_COUNT);
            const topIdx = full.findIndex((i) => keyOf(i) === keyOf(prev[0]));
            if (topIdx <= 0) return prev; // already showing the newest
            // Never shift content under someone reading mid-scroll — newer
            // alerts stay in `full` (reachable by scrolling up) and are
            // announced by the pill.
            if (!atTopRef.current) return prev;
            const estIdx = establishedTopIdx(full);
            if (estIdx >= topIdx) return prev;
            return dedupeNewestFirst([...full.slice(estIdx, topIdx), ...prev]);
        });
    }, [feedItems, isLoading, establishedTopIdx]);

    // ── New-alert pill ───────────────────────────────────────────────────────
    // STATE, not a ref, because it feeds a query key. A ref mutates without
    // re-rendering, so the key would change on whatever unrelated render came
    // next — and the old `new Date().toISOString()` fallback minted a brand-new
    // key on EVERY render, which is a query with no cached data each time.
    const [since, setSince] = useState<string | null>(null);
    const [newCount, setNewCount] = useState(0);

    useEffect(() => {
        if (!data?.pages?.[0]) return;
        // Anchor on the newest alert we actually hold, not on wall-clock: an
        // event can land with an occurredAt a few seconds in the past (the scan
        // reports on-chain time), and "now" would miss it forever.
        setSince((prev) => {
            if (prev) return prev;
            const newest = data.pages[0].items[0];
            return newest ? new Date(newest.occurredAt).toISOString() : new Date().toISOString();
        });
    }, [data]);

    const { data: newCountData } = trpc.coinFeed.newCount.useQuery(
        // Constant placeholder while disabled — anything derived from `now`
        // here would churn the key on every render.
        { ...filterInput, since: since ?? SINCE_PLACEHOLDER },
        {
            enabled: !!since,
            refetchInterval: POLL_MS,
            refetchIntervalInBackground: false,
            staleTime: POLL_MS - 5_000,
        },
    );
    useEffect(() => {
        if (newCountData?.count) setNewCount(newCountData.count);
    }, [newCountData]);

    /** Skeleton rows standing in for alerts that are on their way in. */
    const [incomingCount, setIncomingCount] = useState(0);

    const loadNewAlerts = useCallback(async () => {
        // Held BEFORE the count is cleared, because the pill disappears the
        // instant it's clicked and the fetch below is a real network round
        // trip. Without this the rail sat unchanged with no sign anything was
        // happening, and the alerts then appeared with no transition.
        //
        // Capped at 5: the pill can say 99+, and 99 skeletons would push the
        // list out of the viewport to preview rows that land in one paint
        // anyway. A few rows read as "loading", which is the whole job.
        setIncomingCount(Math.min(Math.max(newCount, 1), 5));
        setNewCount(0);
        // A plain fetch, NOT fetchInfinite: fetchInfinite writes the shared
        // infinite cache, and without a `pages` option it replaces every loaded
        // page with a single fresh one — so each pill click silently threw away
        // everything the user had paginated. This reads the newest page and
        // merges it into our own refs, leaving the infinite cache untouched.
        const fresh = await utils.coinFeed.list
            .fetch({ ...filterInput, limit: PAGE_SIZE })
            .catch(() => null);
        const incoming = fresh?.items ?? [];
        if (incoming.length > 0) {
            const full = dedupeNewestFirst([...incoming, ...fullItemsRef.current]);
            fullItemsRef.current = full;
            // The pill is the ONLY thing that advances the established top.
            establishedTopKey.current = full[0] ? keyOf(full[0]) : null;
            if (full[0]) setSince(new Date(full[0].occurredAt).toISOString());
            setListItems((prev) => dedupeNewestFirst([...incoming, ...prev]).slice(0, VIEW_COUNT));
        }
        setIncomingCount(0);
        listRef.current?.scrollToTop("smooth");
    }, [filterInput, utils, newCount]);

    // ── Realtime ─────────────────────────────────────────────────────────────
    // An INSERT triggers an authoritative newCount refetch rather than an
    // optimistic bump, because the client can't cheaply tell whether the new row
    // passes the active filters — the server already knows.
    useEffect(() => {
        let channel: ReturnType<ReturnType<typeof getRealtimeClient>["channel"]> | null = null;
        let cancelled = false;
        (async () => {
            const client = getRealtimeClient();
            try {
                await authenticateRealtimeClient();
            } catch {
                return; // polling still covers us
            }
            if (cancelled) return;
            channel = client
                .channel("coin-feed-events")
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "coin_feed_events" },
                    () => {
                        void utils.coinFeed.newCount.invalidate();
                    },
                )
                .subscribe();
        })();
        return () => {
            cancelled = true;
            if (channel) getRealtimeClient().removeChannel(channel);
        };
    }, [utils]);

    // ── Changing the dataset resets the window ───────────────────────────────
    // Both the filter panel and the tab switch a different set of rows in, and
    // the sliding window holds state (full dataset, pinned top, cursor anchor)
    // that only makes sense for the set it was built from — reusing it would
    // splice two feeds together.
    const resetWindow = useCallback(() => {
        fullItemsRef.current = [];
        establishedTopKey.current = null;
        populated.current = false;
        setSince(null);
        setNewCount(0);
        setListItems([]);
        setListKey((k) => k + 1);
    }, []);

    const applyFilters = useCallback((next: AlertFilters) => {
        resetWindow();
        setFilters(next);
    }, [resetWindow]);

    const switchTab = useCallback((next: RailTab) => {
        setTab((prev) => {
            if (prev !== next) resetWindow();
            return next;
        });
    }, [resetWindow]);

    // ── onLoadMore ───────────────────────────────────────────────────────────
    const onLoadMore = useCallback(
        async (direction: "up" | "down", refItem: AlertEvent) => {
            const full = fullItemsRef.current;
            const idx = full.findIndex((i) => keyOf(i) === keyOf(refItem));

            if (direction === "up") {
                // Restore alerts windowed out above the current top — but never
                // above the established top; anything sorted above THAT belongs
                // behind the pill.
                if (idx <= 0) return [];
                const floor = establishedTopIdx(full);
                const start = Math.max(idx - PAGE_SIZE, floor);
                return start >= idx ? [] : full.slice(start, idx);
            }

            // Older alerts already loaded below the bottom edge.
            if (idx >= 0 && idx + 1 < full.length) {
                return full.slice(idx + 1, idx + 1 + PAGE_SIZE);
            }

            // Ran off the end — pull the next page, fold it into the full
            // dataset, then hand back the slice BELOW the reference item by
            // index (not by timestamp, which ties).
            if (!hasNextPage) return [];
            const result = await fetchNextPage();
            if (!result.data) return [];
            const pages = dedupeNewestFirst(result.data.pages.flatMap((p) => p.items));
            const pageKeys = new Set(pages.map(keyOf));
            const localPrepends = fullItemsRef.current.filter((i) => !pageKeys.has(keyOf(i)));
            const newFull = dedupeNewestFirst([...localPrepends, ...pages]);
            fullItemsRef.current = newFull;
            const refIdx = newFull.findIndex((i) => keyOf(i) === keyOf(refItem));
            return refIdx < 0 ? [] : newFull.slice(refIdx + 1, refIdx + 1 + PAGE_SIZE);
        },
        [establishedTopIdx, fetchNextPage, hasNextPage],
    );

    // Relative times ("5m") are computed at render, so without a tick the rail
    // would sit frozen on however old each row was when it first painted — very
    // visible on a feed whose whole point is recency. One cheap re-render a
    // minute; scroll position is untouched by it.
    const [, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 60_000);
        return () => clearInterval(t);
    }, []);

    const renderItem = useCallback((item: AlertEvent) => <AlertRow event={item} />, []);

    const summary = activeFilterSummary(filters);

    // Tabs left, controls right — colour alone carries the active state, same as
    // the home right rail. Mentions is an ICON tab, and every icon here matches
    // that rail's star at size-6 so the row reads as one set of controls.
    //
    // A PLAIN ROW now, handed to RailShell as its `header`. It used to be its own
    // bordered Squircle sitting on top of the list's, and that is what drew the
    // line under the tabs: Lisse strokes the whole path with no per-side option,
    // so two boxes that meet draw two hairlines. Overlapping them by a pixel only
    // merged the pair into one — it couldn't remove it. Inside one Squircle there
    // is no internal edge to draw.
    //
    // `//`, not `{/* */}` — a JSX comment straight after `(` parses as an object
    // literal and fails the Turbopack build (CLAUDE.md).
    const railHeader = (
        <>
        <div className="flex items-center px-2 pt-2">
                {(["alerts"] as const).map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => switchTab(t)}
                        aria-pressed={tab === t}
                        className={cn(
                            "cursor-pointer whitespace-nowrap px-2 pt-2 pb-2 text-[15px] font-medium tracking-tight transition-colors",
                            tab === t ? "text-white" : "text-zinc-500 hover:text-white",
                        )}
                    >
                        {t}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => switchTab("mentions")}
                    aria-pressed={tab === "mentions"}
                    aria-label="mentions"
                    className={cn(
                        "flex cursor-pointer items-center px-1.5 py-1.5 transition-colors",
                        tab === "mentions" ? "text-white" : "text-zinc-500 hover:text-white",
                    )}
                >
                    <HugeiconsIcon icon={AtIcon} className="size-6" strokeWidth={2} />
                </button>

                <div className="ml-auto flex items-center">
                    <AlertFiltersButton filters={filters} onChange={applyFilters} coverage={coverage} />
                    {/* Plain minus, sized and coloured like the other header
                        icons (AtIcon, the filter button) so the row reads as one
                        set. */}
                    {onCollapse && (
                        <button
                            type="button"
                            onClick={onCollapse}
                            aria-label="minimize alerts rail"
                            className="flex cursor-pointer items-center px-1.5 py-1.5 text-zinc-500 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={MinusSignIcon} className="size-6" strokeWidth={2} />
                        </button>
                    )}
                </div>
        </div>
        {/* The active-filter summary belongs to the header, not to the list —
            it describes what the list is showing. */}
        {summary && <p className="truncate px-2 pt-0.5 text-[11px] text-zinc-600">{summary}</p>}
        </>
    );

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className={cn("flex min-h-0 flex-1 flex-col rounded-none", className)}>

            {/* The list, in the shared bordered/squircled rail shell — the same
                box home's video rail puts its list in. It wraps the ITEMS only;
                the tabs above stay outside it.

                RailShell keeps the min-h-0 + flex-1 that lets this scroll
                inside the sticky rail instead of growing the column, and its
                inner element has a definite height — which BidirectionalList
                needs, since it sizes its own scroller with height:100%. */}
            {/* mb-7 overrides RailShell's own mb-2 (cn is twMerge), lifting the
                list clear of the bottom of the screen. Scoped here rather than
                changed in the shell — the video rail still wants to run near the
                bottom edge.

                radius 25 on ALL corners now, and the tabs ride inside as
                `header`. Previously the tabs were their own top-rounded box and
                this was bottom-rounded, which is what put a rule under the tabs
                — see the header prop's note in rail-shell. */}
            <RailShell className="mb-7" radius={25} bordered header={railHeader}>
                {/* "n new" pill. h-0 wrapper so it floats OVER the list rather
                    than pushing it down — a pill that reflows the feed would move
                    the row under the cursor, which is the exact thing the pin
                    prevents.

                    INSIDE the shell, deliberately. It used to render above it,
                    where the same h-0 overflow landed on the TABS and covered
                    them. Floating over rows is the point; floating over the
                    controls is a bug. */}
                <div className="relative z-20 h-0 overflow-visible">
                    <AnimatePresence>
                        {newCount > 0 && !atTop && (
                            <motion.div
                                key="new-alerts-pill"
                                initial={{ y: -40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -40, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.4 }}
                                className="flex justify-center pt-1.5"
                            >
                                <button
                                    type="button"
                                    onClick={loadNewAlerts}
                                    className="flex cursor-pointer items-center gap-1 rounded-full bg-twitter2 px-3 py-1.5 text-[12px] font-bold text-flexwhite/95 transition-transform active:scale-95"
                                >
                                    <HugeiconsIcon icon={ArrowUp02Icon} className="size-3.5" strokeWidth={2.5} />
                                    {newCount === 99 ? "99+" : newCount} new
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                {/* Inline bar when already parked at the top — no need to float.
                    Inside the shell, above the scroller: it belongs to the list
                    it's offering to extend, so it sits within the same bordered
                    box rather than floating loose above it. shrink-0 keeps it
                    off the scroller's flex share. */}
                {newCount > 0 && atTop && (
                    <button
                        type="button"
                        onClick={loadNewAlerts}
                        className="shrink-0 cursor-pointer bg-soft-gray-5 hover:bg-soft-gray-10 active:bg-soft-gray-15 border-b border-sidebar-hover py-2.5 text-[13px] font-medium text-twitter2 transition-colors"
                    >
                        Show {newCount === 99 ? "99+" : newCount} new alert{newCount === 1 ? "" : "s"}
                    </button>
                )}

                {/* Placeholders for the alerts being fetched, at the top of the
                    shell because that is exactly where they will land. Outside
                    the scroller (BidirectionalList owns that) so they can't
                    disturb its windowing maths — they occupy the same spot the
                    real rows will, then swap out. */}
                {incomingCount > 0 && (
                    <div className="shrink-0" aria-hidden>
                        {Array.from({ length: incomingCount }).map((_, i) => (
                            <AlertRowSkeleton key={i} index={i} count={incomingCount} />
                        ))}
                    </div>
                )}

                {/* The error state is for having NOTHING to show — not merely
                    for the query being in an error state.

                    An infinite query goes to isError when ANY fetch fails,
                    including a fetchNextPage deep into pagination, and its
                    cached pages stay intact throughout. Checking isError first
                    therefore threw away a full, working feed the moment one
                    page request failed — and onLoadMore fires unprompted (the
                    700px threshold prefetches in a rail this short), so it
                    happened while just sitting there. */}
                {isError && windowItems.length === 0 ? (
                    <div className="px-3 py-10 text-center">
                        <p className="text-[13px] font-bold text-zinc-400">couldn&apos;t load alerts</p>
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            className="mt-2 cursor-pointer rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] font-bold text-zinc-300 transition-colors hover:text-white"
                        >
                            try again
                        </button>
                    </div>
                ) : isLoading && !populated.current ? (
                    <AlertListSkeleton />
                ) : windowItems.length === 0 ? (
                    <div className="px-3 py-10 text-center">
                        <p className="text-[13px] font-bold text-zinc-400">
                            {tab === "mentions" ? "no mentions yet" : "no alerts yet"}
                        </p>
                        <p className="mt-1 text-[12px] text-zinc-600">
                            {summary
                                ? "nothing matches these filters."
                                : tab === "mentions"
                                  ? "alerts on your coins and your trades land here."
                                  : "trader clusters, callouts and predictions land here."}
                        </p>
                    </div>
                ) : (
                    (() => {
                        const unique = windowItems;
                        const full = fullItemsRef.current;
                        const top = unique[0];
                        const bottom = unique[unique.length - 1];
                        const topIdx = top ? full.findIndex((i) => keyOf(i) === keyOf(top)) : -1;
                        // Scroll-up loading only when there are SEEN alerts
                        // between the pinned top and the window top.
                        const hasPrevious = topIdx > establishedTopIdx(full);
                        const atLoadedEnd =
                            !!bottom && full.length > 0 && keyOf(full[full.length - 1]) === keyOf(bottom);
                        // Don't ask for another page while the query is failing
                        // — the list would call onLoadMore on a loop against a
                        // fetch that keeps erroring. Local slicing from `full`
                        // still works, so scrolling stays alive.
                        //
                        // BOTH flags: `isError` covers a feed that never loaded,
                        // `isFetchNextPageError` a feed whose FIRST page is fine
                        // and whose later pages are not. Only the second was
                        // ever true in the loop this guard was written for, and
                        // it wasn't being checked.
                        const hasNext =
                            !atLoadedEnd || (!!hasNextPage && !isError && !isFetchNextPageError);

                        return (
                            // relative wraps the list so the indicator has a
                            // positioning context — BidirectionalList owns the
                            // scroll element itself, so there's nothing inside
                            // it to hang this off.
                            <div className="relative flex min-h-0 flex-1 flex-col">
                            <RailScrollbar getScroller={() => listRef.current?.scrollViewRef.current ?? null} />
                            <BidirectionalList<AlertEvent>
                                key={listKey}
                                ref={listRef}
                                items={unique}
                                itemKey={keyOf}
                                renderItem={renderItem}
                                onLoadMore={onLoadMore}
                                onItemsChange={setListItems}
                                hasPrevious={hasPrevious}
                                hasNext={hasNext}
                                viewCount={VIEW_COUNT}
                                threshold={LOAD_THRESHOLD_PX}
                                // The rail owns its scroller — see the header note.
                                useWindow={false}
                                className="hidden-scrollbar"
                                spinnerRow={
                                    <div className="flex justify-center py-3">
                                        <div className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
                                    </div>
                                }
                            />
                            </div>
                        );
                    })()
                )}

                {/* Errored but still holding alerts: say so quietly at the
                    bottom instead of replacing the feed. A failed NEXT page
                    counts — that's the case where the rail looks perfectly
                    healthy and simply stops growing. */}
                {(isError || isFetchNextPageError) && windowItems.length > 0 && (
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="mx-1 mb-1 shrink-0 cursor-pointer rounded-full py-1.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:text-zinc-300"
                    >
                        couldn&apos;t refresh · retry
                    </button>
                )}
            </RailShell>
        </div>
    );
}
