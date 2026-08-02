"use client";

import { useEffect, useRef, useState } from "react";
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
    const asideRef = useRef<HTMLElement>(null);

    // After mount, never during render — the app shell server-renders, and
    // reading localStorage in render would be a hydration mismatch.
    useEffect(() => {
        try {
            setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
        } catch {
            // storage disabled — expanded is the right default
        }
    }, []);

    // Publish where this rail ENDS so the app header can leave a transparent
    // column over it (see app-header2's scroll backdrop). The header is fixed
    // and lives outside the page tree, so it has no other way to know — and the
    // answer moves when the rail collapses.
    //
    // The RIGHT EDGE, not the width. The header is `fixed left-0`, so its
    // coordinate space starts at the viewport edge, while the rail starts
    // inset by the page row's px-1. Publishing the width would put the split
    // 4px left of the rail's actual edge; the edge is already measured from the
    // same origin the header uses, so the two line up whatever the padding is.
    //
    // MEASURED rather than derived from the w-72/w-11 classes: below lg the
    // aside is `hidden`, whose rect is all zeroes, so the header falls back to
    // a full-width backdrop without duplicating the breakpoint. The variable is
    // removed on unmount, so every other route is unaffected.
    //
    // The parent is observed too: pinning the app sidebar shifts the inset,
    // which moves the rail's edge without changing the rail's own width — so a
    // ResizeObserver on the aside alone would never fire for it.
    //
    // Keyed on `collapsed` because the two branches render different elements.
    useEffect(() => {
        const el = asideRef.current;
        if (!el) return;
        const root = document.documentElement;
        const sync = () => root.style.setProperty("--home-rail-edge", `${el.getBoundingClientRect().right}px`);
        sync();
        const observer = new ResizeObserver(sync);
        observer.observe(el);
        if (el.parentElement) observer.observe(el.parentElement);
        window.addEventListener("resize", sync);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", sync);
            root.style.removeProperty("--home-rail-edge");
        };
    }, [collapsed]);

    const set = (next: boolean) => {
        setCollapsed(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch { /* not worth failing the toggle over */ }
    };

    if (collapsed) {
        return (
            <aside ref={asideRef} className="hidden w-11 shrink-0 lg:block">
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
        <aside ref={asideRef} className="hidden w-72 shrink-0 lg:block">
            <div className={INNER_EXPANDED}>
                <AlertsRail onCollapse={() => set(true)} />
            </div>
        </aside>
    );
}
