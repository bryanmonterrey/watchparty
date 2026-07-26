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
        // Scrolls rather than wraps: seven pills fit an ~830px column at the
        // widths we have, but the column narrows well below that at lg.
        <nav className="hidden-scrollbar flex w-full items-center gap-2 overflow-x-auto">
            {TABS.map((tab) => (
                <button
                    key={tab}
                    type="button"
                    onClick={() => setActive(tab)}
                    aria-pressed={active === tab}
                    // No fill behind the active tab — colour alone carries it.
                    // The padding stays for hit area even though nothing paints
                    // it, and is what spaces the labels apart.
                    className={cn(
                        "shrink-0 cursor-pointer whitespace-nowrap px-3.5 py-1.5 text-lg font-semibold transition-colors",
                        active === tab ? "text-white" : "text-zinc-500 hover:text-white"
                    )}
                >
                    {tab}
                </button>
            ))}

            {/* Right end of the row. Not a control yet — nothing is wired to
                it, so it renders as a plain mark rather than a button that
                would do nothing on click. ml-auto parks it at the right edge
                whenever the pills don't fill the row. */}
            <span className="ml-auto shrink-0 pl-2 pr-1 text-zinc-500">
                <HugeiconsIcon icon={ArrowRightDoubleIcon} className="size-6" strokeWidth={2} />
            </span>
        </nav>
    );
}
