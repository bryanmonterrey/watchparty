"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { ArrowRightDoubleIcon } from "@hugeicons/core-free-icons";
import { AlertsRail } from "@/components/coin-feed/alerts-rail";

// Home's left column. This exists as a client component purely to own the
// COLLAPSED state: the page itself is a server component, and the width lives
// on the <aside>, so the toggle and the element it resizes have to sit in the
// same client boundary. Rendering the aside here (rather than passing a
// callback up) keeps that in one place.
//
// Collapsed is persisted — a rail you shut should stay shut across navigations
// and reloads, or the button feels like it did nothing.

const STORAGE_KEY = "wp:coin-alerts:collapsed";

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
    const [collapsed, setCollapsed] = useState(false);
    const pathname = usePathname();

    // After mount, never during render — the app shell server-renders, and
    // reading localStorage in render would be a hydration mismatch.
    useEffect(() => {
        try {
            setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
        } catch {
            // storage disabled — expanded is the right default
        }
    }, []);

    const set = (next: boolean) => {
        setCollapsed(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch { /* not worth failing the toggle over */ }
    };

    // Collapsing behaves differently on /feed, and it has to.
    //
    // Home and the token page give the reclaimed 244px to a column that can use
    // it — home's centre is flex-1 and simply widens. The feed's column is
    // capped at a 628px reading measure, so it can't grow into the space; the
    // whole row just slid sideways instead, which is what "collapsing doesn't
    // move other columns" was about. There the rail holds its width and empties
    // to the expand control, and nothing outside this aside moves.
    //
    // Read from the pathname rather than taken as a prop because the rail is
    // mounted ONCE, by (rails)/layout.tsx, for all three routes — there's no
    // per-page call site left to pass a flag from.
    const keepsWidth = pathname?.startsWith("/feed") ?? false;

    if (collapsed) {
        return (
            <aside className={cn("hidden shrink-0 lg:block", keepsWidth ? "w-72" : "w-11")}>
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
                        <HugeiconsIcon icon={ArrowRightDoubleIcon} className="size-6" strokeWidth={2} />
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
