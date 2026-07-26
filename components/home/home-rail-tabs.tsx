"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarCircleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useEdgeScroll } from "@/hooks/use-edge-scroll";
import { TabScrollArrow } from "./tab-scroll-arrow";

// Right-rail tabs. The icon is the FIRST TAB, not a heading above them — it
// selects and deselects like any label, and starts selected.
//
// Same type size as the centre column's category tabs, which five labels
// cannot fit in a 300px rail — hence the scroll arrows, same as over there:
// each appears only while there is overflow that way.
//
// Visual only for now: picking one recolours it and nothing else, since the
// rail has no content under it yet.
const ICON_TAB = "trending";
const TABS = [ICON_TAB, "For you", "Live", "New", "Upcoming"];

export function HomeRailTabs() {
    const [active, setActive] = useState(ICON_TAB);
    const { ref, canLeft, canRight, nudge } = useEdgeScroll<HTMLDivElement>();

    return (
        <nav className="relative w-full">
            <div
                ref={ref}
                className="hidden-scrollbar flex items-center gap-1 overflow-x-auto scroll-smooth"
            >
                {TABS.map((tab) => {
                    const isIcon = tab === ICON_TAB;
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActive(tab)}
                            aria-pressed={active === tab}
                            aria-label={isIcon ? "Trending" : undefined}
                            // Same treatment as the category tabs: no fill,
                            // colour alone carries the active state.
                            className={cn(
                                "flex shrink-0 cursor-pointer items-center whitespace-nowrap px-1.5 py-1.5 text-lg font-semibold transition-colors",
                                active === tab ? "text-white" : "text-zinc-500 hover:text-white"
                            )}
                        >
                            {isIcon ? (
                                <HugeiconsIcon icon={StarCircleIcon} className="size-6" strokeWidth={2} />
                            ) : (
                                tab
                            )}
                        </button>
                    );
                })}
            </div>

            {canLeft && (
                <TabScrollArrow direction="left" label="Scroll tabs left" onClick={() => nudge(-1)} />
            )}
            {canRight && (
                <TabScrollArrow direction="right" label="Scroll tabs right" onClick={() => nudge(1)} />
            )}
        </nav>
    );
}
