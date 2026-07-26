"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRightStackIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Right-rail tabs. The icon is the FIRST TAB, not a heading above them — it
// selects and deselects like any label, and starts selected.
//
// Type is one step under the centre column's category tabs (text-base vs
// text-lg) — near enough to read as the same control, small enough to claw
// back a little width. It is still tight: the rail is 300px wide, leaving
// ~268px after its padding, and these five want roughly 290px, so the strip
// scrolls the last of "upcoming" out of reach. Widening the rail or dropping
// to text-sm are the two ways out.
//
// Visual only for now: picking one recolours it and nothing else, since the
// rail has no content under it yet.
const ICON_TAB = "trending";
const TABS = [ICON_TAB, "For you", "Live", "New", "Upcoming"];

export function HomeRailTabs() {
    const [active, setActive] = useState(ICON_TAB);

    return (
        <nav className="hidden-scrollbar flex w-full items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
                const isIcon = tab === ICON_TAB;
                return (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActive(tab)}
                        aria-pressed={active === tab}
                        aria-label={isIcon ? "Trending" : undefined}
                        // Same treatment as the category tabs: no fill, colour
                        // alone carries the active state.
                        className={cn(
                            "flex shrink-0 cursor-pointer items-center whitespace-nowrap px-1.5 py-1.5 text-base font-semibold transition-colors",
                            active === tab ? "text-white" : "text-zinc-500 hover:text-white"
                        )}
                    >
                        {isIcon ? (
                            <HugeiconsIcon icon={ArrowUpRightStackIcon} className="size-6" strokeWidth={2} />
                        ) : (
                            tab
                        )}
                    </button>
                );
            })}
        </nav>
    );
}
