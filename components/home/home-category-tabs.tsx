"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeftDoubleIcon, ArrowRightDoubleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useEdgeScroll } from "@/hooks/use-edge-scroll";

// Category tabs for the home column. They live in the gap BETWEEN the screen
// and the row under it — on the bare app canvas rather than on either panel —
// and sit closer to the row below, which is what they filter.
//
// Picking a tab recolours it and nothing else for now, because neither row is
// wired to content yet. The scroll arrows, by contrast, are real controls.
const TABS = [
    "Trending Coins",
    "IRL",
    "Podcasts",
    "Streamers",
    "Traders",
    "Special Events",
    "Music",
    // Sits in the row as an ordinary tab for now, so it selects like the rest.
    // It reads as an action rather than a category, so pull it out of this list
    // when there is something for it to open.
    "View all",
];

// Both arrows overlay the strip rather than sitting beside it. Two reasons:
// the backdrop blur needs labels behind it to be worth anything, and a control
// that appears and disappears with scroll position would otherwise resize the
// strip and shove the labels sideways every time it toggled.
const ARROW =
    "absolute top-1/2 z-10 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-sidebar-hover-35 hover:bg-sidebar-hover-55 backdrop-blur-lg text-zinc-300 transition-colors hover:text-white";

export function HomeCategoryTabs() {
    const [active, setActive] = useState(TABS[0]);
    // "When available": each arrow shows only while there is actually overflow
    // that way, so neither appears when every label already fits. Shared with
    // the rail's tabs, which need the same behaviour at a different size.
    const { ref: stripRef, canLeft, canRight, nudge } = useEdgeScroll<HTMLDivElement>();

    return (
        <nav className="relative w-full">
            {/* The strip scrolls rather than wraps: seven labels fit an ~830px
                column, but it narrows well below that at lg. */}
            <div
                ref={stripRef}
                className="hidden-scrollbar flex items-center gap-2 overflow-x-auto scroll-smooth"
            >
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActive(tab)}
                        aria-pressed={active === tab}
                        // No fill behind the active tab — colour alone carries
                        // it. The padding stays for hit area even though nothing
                        // paints it, and is what spaces the labels apart.
                        className={cn(
                            "shrink-0 cursor-pointer whitespace-nowrap px-3.5 py-1.5 tracking-tight text-lg font-semibold transition-colors",
                            active === tab ? "text-white" : "text-zinc-500 hover:text-white"
                        )}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {canLeft && (
                <button
                    type="button"
                    aria-label="Scroll categories left"
                    onClick={() => nudge(-1)}
                    className={cn(ARROW, "left-0")}
                >
                    <HugeiconsIcon icon={ArrowLeftDoubleIcon} className="size-5" strokeWidth={2} />
                </button>
            )}

            {canRight && (
                <button
                    type="button"
                    aria-label="Scroll categories right"
                    onClick={() => nudge(1)}
                    className={cn(ARROW, "right-0")}
                >
                    <HugeiconsIcon icon={ArrowRightDoubleIcon} className="size-5" strokeWidth={2} />
                </button>
            )}
        </nav>
    );
}
