"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useEdgeScroll } from "@/hooks/use-edge-scroll";
import { TabScrollArrow } from "./tab-scroll-arrow";

// Category tabs for the home column. They live in the gap BETWEEN the screen
// and the row under it — on the bare app canvas rather than on either panel —
// and sit closer to the row below, which is what they filter.
//
// Controlled when given `active`/`onChange` (home lifts the selection so the
// panel below can render for it), uncontrolled otherwise.
export const HOME_TABS = [
    "Trending Coins",
    "Feed",
    "Just Chatting",
    "IRL",
    "Podcasts",
    "Streamers",
    "Traders",
    "Predictions",
    "Music",
    // Sits in the row as an ordinary tab for now, so it selects like the rest.
    // It reads as an action rather than a category, so pull it out of this list
    // when there is something for it to open.
    "View all",
];

export function HomeCategoryTabs({
    active: controlledActive,
    onChange,
}: {
    active?: string;
    onChange?: (tab: string) => void;
} = {}) {
    const [uncontrolled, setUncontrolled] = useState(HOME_TABS[0]);
    const active = controlledActive ?? uncontrolled;
    const setActive = (tab: string) => {
        if (onChange) onChange(tab);
        else setUncontrolled(tab);
    };
    // "When available": each arrow shows only while there is actually overflow
    // that way, so neither appears when every label already fits. Shared with
    // the rail's tabs, which need the same behaviour at a different size.
    const { ref: stripRef, canLeft, canRight, nudge } = useEdgeScroll<HTMLDivElement>();

    return (
        <nav className="relative w-full">
            {/* The strip scrolls rather than wraps: the labels fit the full
                centre column, but it narrows well below that at lg. */}
            <div
                ref={stripRef}
                className="hidden-scrollbar flex items-center gap-2 overflow-x-auto scroll-smooth"
            >
                {HOME_TABS.map((tab) => (
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
                            active === tab ? "text-twitter2" : "text-zinc-500 hover:text-white"
                        )}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {canLeft && (
                <TabScrollArrow direction="left" label="Scroll categories left" onClick={() => nudge(-1)} />
            )}
            {canRight && (
                <TabScrollArrow direction="right" label="Scroll categories right" onClick={() => nudge(1)} />
            )}
        </nav>
    );
}
