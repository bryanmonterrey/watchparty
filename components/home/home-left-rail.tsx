"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
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
const INNER = "sticky top-0 z-10 flex h-[100svh] flex-col md:pt-[calc(var(--header-height)+4px)]";

// Expanded only. No divider — the alerts list carries its own outline now (see
// RailShell's `bordered`), and a full-height rule beside a box that stops short
// of the bottom read as a line running off on its own.
const INNER_EXPANDED = `${INNER} px-1.5`;

export function HomeLeftRail() {
    const [collapsed, setCollapsed] = useState(false);

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

    if (collapsed) {
        return (
            <aside className="hidden w-11 shrink-0 lg:block">
                <div className={INNER}>
                    {/* size-6 and the same padding as the expanded rail's
                        header buttons — collapsing shouldn't resize the control
                        you just clicked. */}
                    <button
                        type="button"
                        onClick={() => set(false)}
                        aria-label="expand alerts rail"
                        className="mx-auto flex cursor-pointer items-center px-1.5 py-1.5 text-zinc-500 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon icon={ArrowRightDoubleIcon} className="size-6" strokeWidth={2} />
                    </button>
                </div>
            </aside>
        );
    }

    return (
        <aside className="hidden w-72 shrink-0 lg:block">
            <div className={INNER_EXPANDED}>
                <AlertsRail onCollapse={() => set(true)} />
            </div>
        </aside>
    );
}
