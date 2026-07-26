"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRightDoubleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Category tabs for the home column. They live in the gap BETWEEN the screen
// and the row under it — on the bare app canvas rather than on either panel —
// and sit closer to the row below, which is what they filter.
//
// Visual only for now: picking a tab recolours it and nothing else, because
// neither row is wired to content yet.
const TABS = [
    "Trending Coins",
    "IRL",
    "Podcasts",
    "Streamers",
    "Traders",
    "Special Events",
    "Music",
];

export function HomeCategoryTabs() {
    const [active, setActive] = useState(TABS[0]);

    return (
        <nav className="flex w-full items-center">
            {/* The strip scrolls rather than wraps: seven labels fit an ~830px
                column, but it narrows well below that at lg. flex-1 + min-w-0
                so it takes the width the arrow doesn't. */}
            <div className="hidden-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
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
                            "shrink-0 cursor-pointer whitespace-nowrap px-3.5 py-1.5 text-lg font-semibold transition-colors",
                            active === tab ? "text-white" : "text-zinc-500 hover:text-white"
                        )}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Pinned to the row's right edge, OUTSIDE the scroller — as a
                sibling of the strip it can't be pushed along by the labels or
                scrolled out of view once they overflow. Padding matches a
                tab's, so its inset from the right mirrors the first label's
                from the left.

                Not a control yet: nothing is wired to it, so it renders as a
                plain mark rather than a button that would do nothing. */}
            <span className="shrink-0 px-3.5 text-zinc-500">
                <HugeiconsIcon icon={ArrowRightDoubleIcon} className="size-6" strokeWidth={2} />
            </span>
        </nav>
    );
}
