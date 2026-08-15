"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { GreaterThanCircleIcon } from "@hugeicons/core-free-icons";
import { AlertsRail } from "@/components/coin-feed/alerts-rail";

// Home's left column. This exists as a client component purely to own the
// COLLAPSED state: the page itself is a server component, and the width lives
// on the <aside>, so the toggle and the element it resizes have to sit in the
// same client boundary. Rendering the aside here (rather than passing a
// callback up) keeps that in one place.
//
// Collapsed is persisted — a rail you shut should stay shut across navigations
// and reloads, or the button feels like it did nothing.
//
// It also starts MINIMIZED. The alerts rail is a side channel, not the page, so
// the default is out of the way and opening it is a deliberate act. Absence of
// a stored value therefore means collapsed, not expanded — the initial state and
// the read below have to agree on that or the rail flips open on first paint.

// Versioned, and the bump to :v2 is a deliberate ONE-TIME RESET (2026-08-13).
//
// Collapsed was already the default for anyone new — useState(true), and an
// absent key reads as collapsed. But everyone who had ever opened the rail
// carried an explicit "0" forever, so in practice the app had a large
// population for whom the rail was permanently expanded, which is not what
// this surface is for. Orphaning the old key discards those and starts
// everybody collapsed once.
//
// It overrides a choice people actively made, so it is worth doing exactly
// once and not casually: the very next click writes :v2 and that preference
// sticks. Bump again only for another intentional reset.
const STORAGE_KEY = "wp:coin-alerts:collapsed:v2";

// Mirrors the right rail's RAIL_INNER: the rails pin at the scroller's top, so
// their own padding is what clears the fixed header.
// z-10 is load-bearing, and is why the hero's ambient glow doesn't wash over
// this rail. `sticky` makes this a POSITIONED element, <main> is positioned
// too, and both sit at z-index auto — so among them paint order is DOM order,
// and main (which comes after this rail) drew itself and the glow inside it
// straight over the top. No background on the rail can fix that; it was being
// painted first. The right rail never had the problem because it comes after
// main. z-10 clears main's subtree while staying well under the app header
// (z-50) and the overlays.
//
// h-[100svh] rather than h-screen: identical on desktop, but svh is the stable
// one and this element's height is what the divider's length is measured by.
// One wrapper for every state: collapsing changes the aside's WIDTH (and only
// on some routes — see keepsWidth), never this element's padding or pinning.
//
// No divider: the alerts list carries its own outline (see RailShell's
// `bordered`), and a full-height rule beside a box that stops short of the
// bottom read as a line running off on its own.
const INNER = "sticky top-0 z-10 flex h-[100svh] flex-col pl-3 md:pt-[calc(var(--header-height))]";

export function HomeLeftRail() {
    const [collapsed, setCollapsed] = useState(true);
    const pathname = usePathname();

    // After mount, never during render — the app shell server-renders, and
    // reading localStorage in render would be a hydration mismatch.
    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            // Never opened it before → stay collapsed. ONLY an explicit "0"
            // (they opened it and we saved that) expands the rail.
            //
            // Written as "not 0" rather than "is 1" so it fails CLOSED. The two
            // agree on the values we write, but `stored === "1"` expands the
            // rail for every OTHER value — a legacy "true"/"false" from an
            // earlier shape, a half-written entry, anything a future rename
            // leaves behind. Defaulting to open on data we don't recognise is
            // backwards for a surface whose whole premise is that it stays out
            // of the way until asked for.
            setCollapsed(stored !== "0");
        } catch {
            // storage disabled — collapsed is the default either way
        }
    }, []);

    const set = (next: boolean) => {
        setCollapsed(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch { /* not worth failing the toggle over */ }
    };

    // Collapsing behaves differently on the FeedFrame routes, and it has to.
    //
    // Home and the token page give the reclaimed 244px to a column that can use
    // it. Home's centre is NOT flex-1 any more — it's the feed's 628px measure —
    // so it takes the space by raising its cap to 872 (628 + 244) off the
    // data-rail-collapsed attribute below, which comes to the same thing: the
    // column widens and the right rail doesn't move.
    //
    // The feed's column can't do that: it IS the 628px reading measure, at every
    // width, so there's nothing for it to grow into and the whole row just slid
    // sideways instead — which is what "collapsing doesn't move other columns"
    // was about. There the rail holds its width and empties to the expand
    // control, and nothing outside this aside moves.
    //
    // Read from the pathname rather than taken as a prop because the rail is
    // mounted ONCE, by (rails)/layout.tsx, for all the routes — there's no
    // per-page call site left to pass a flag from. The list must cover every
    // route that renders FeedFrame: /status is the post page, which shares the
    // feed's exact columns via feed-frame.tsx — checking only /feed is how the
    // post page regressed to sliding sideways after posts moved off /feed/post.
    const keepsWidth =
        (pathname?.startsWith("/feed") || pathname?.startsWith("/status")) ?? false;

    if (collapsed) {
        return (
            // data-rail-collapsed is read by the CENTRE COLUMN, not by anything
            // in here: home's main widens by exactly the 244px this gives up
            // (group-has-[[data-rail-collapsed=true]] in home-page-surface), so
            // the right rail keeps its absolute position instead of sliding left
            // with the column. An attribute rather than lifted state because the
            // rail mounts once in (rails)/layout.tsx and the column is a
            // descendant of the same row — CSS can see it without a store.
            <aside
                data-rail-collapsed={keepsWidth ? "false" : "true"}
                className={cn("hidden shrink-0 lg:block", keepsWidth ? "w-72" : "w-11")}
            >
                <div className={INNER}>
                    {/* Holding the column, the chevron sits where the collapse
                        control it replaces sat — the right end of the header row
                        — so it doesn't jump under the cursor. In the narrow
                        strip there's only one place for it. */}
                    <button
                        type="button"
                        onClick={() => set(false)}
                        aria-label="expand alerts rail"
                        className={cn(
                            "flex cursor-pointer items-center px-1.5 py-1.5 text-zinc-500 transition-colors hover:text-white",
                            keepsWidth ? "self-end" : "mx-auto",
                        )}
                    >
                        <HugeiconsIcon icon={GreaterThanCircleIcon} className="size-6" strokeWidth={2} />
                    </button>
                </div>
            </aside>
        );
    }

    return (
        <aside className="hidden w-72 shrink-0 lg:block">
            <div className={INNER}>
                <AlertsRail onCollapse={() => set(true)} />
            </div>
        </aside>
    );
}
