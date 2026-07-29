"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { StarCircleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useEdgeScroll } from "@/hooks/use-edge-scroll";
import { TabScrollArrow } from "@/components/home/tab-scroll-arrow";

// The app's right-rail tab row, lifted out of home so the video and live rails
// can be the same component rather than three lookalikes that drift.
//
// The icon is the FIRST TAB, not a heading above them — it selects and
// deselects like any label.
//
// Same type size as the centre column's category tabs, which five labels cannot
// fit in a 300px rail — hence the scroll arrows, same as over there: each
// appears only while there is overflow that way.

/** Rendered as a mark instead of a word. Still just a tab. */
export const RAIL_ICON_TAB = "trending";

/** The shared set. Video and live run these; live prepends "Chat". */
export const RAIL_TABS = [RAIL_ICON_TAB, "For you", "Live", "New", "Upcoming"];

/**
 * Home diverges: "For you" is named "Feed" there (it IS the feed the hero plays
 * from, not a recommendation slice beside one), and "Liked" follows it. Kept as
 * its own list rather than changed in RAIL_TABS so the video and live rails —
 * which nobody asked to change — keep the labels they have.
 */
export const HOME_TAB_FEED = "Feed";
export const HOME_TAB_LIKED = "Liked";
/**
 * "Clips" is a BUTTON wearing a tab, not a filter: it opens the shorts feed as a
 * full-bleed overlay (components/home/clips-overlay.tsx) instead of narrowing the
 * rail's list. So it never becomes the rail's active tab — whatever was selected
 * stays selected underneath, and is still selected when the overlay closes.
 */
export const HOME_TAB_CLIPS = "Clips";
export const HOME_RAIL_TABS = [RAIL_ICON_TAB, HOME_TAB_FEED, HOME_TAB_LIKED, "Live", HOME_TAB_CLIPS, "New", "Upcoming"];

export function RailTabs({
    tabs = RAIL_TABS,
    active,
    onChange,
    className,
}: {
    tabs?: string[];
    active: string;
    onChange: (tab: string) => void;
    className?: string;
}) {
    const { ref, canLeft, canRight, nudge } = useEdgeScroll<HTMLDivElement>();

    return (
        <nav className={cn("relative w-full", className)}>
            <div
                ref={ref}
                className="hidden-scrollbar flex items-center gap-1 overflow-x-auto scroll-smooth"
            >
                {tabs.map((tab) => {
                    const isIcon = tab === RAIL_ICON_TAB;
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => onChange(tab)}
                            aria-pressed={active === tab}
                            aria-label={isIcon ? "Trending" : undefined}
                            // No fill — colour alone carries the active state,
                            // same as the category tabs.
                            className={cn(
                                "flex shrink-0 cursor-pointer items-center whitespace-nowrap px-1.5 py-1.5 text-lg font-semibold transition-colors",
                                active === tab ? "text-white" : "text-zinc-500 hover:text-white",
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

            {canLeft && <TabScrollArrow direction="left" label="Scroll tabs left" onClick={() => nudge(-1)} />}
            {canRight && <TabScrollArrow direction="right" label="Scroll tabs right" onClick={() => nudge(1)} />}
        </nav>
    );
}
