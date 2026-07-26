"use client";

import { cn } from "@/lib/utils";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";
import { useHomeFeed, type HomeFeedVideo } from "./home-feed-context";

// The rail's video list — this is the carousel's picker, relocated. Clicking a
// row makes it the hero, exactly as clicking a cell in the old 3x3 grid did.
//
// h-28 rows: a 16:9 thumbnail at that height would be ~199px wide and leave
// almost nothing for text in a 300px rail, so the thumbnail is fixed at 135px
// (still 16:9) and the info takes the rest.
const ROW = "flex h-fit p-2 w-full items-start justify-start gap-3 text-left transition-colors";
const THUMB = "relative h-[45px] w-[85px] shrink-0 overflow-hidden rounded-xs bg-muted";
const SKELETON_COUNT = 5;

function RailVideo({ v, isActive, onSelect }: { v: HomeFeedVideo; isActive: boolean; onSelect: () => void }) {
    return (
        // autoEffects off: the row has no border for the clip-path to eat, and
        // it avoids the wrapper div that would otherwise sit between the list
        // and the button. No rounded-* either — redundant under the clip.
        <Squircle asChild radius={12} autoEffects={false}>
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={isActive}
            className={cn(ROW, "cursor-pointer", isActive ? "bg-sidebar-hover/85" : "hover:bg-sidebar-hover-35/60")}
        >
            <span className={THUMB}>
                {v.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                )}
                {v.isLive && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Live
                    </span>
                )}
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-0.2">
                {v.user.username && (
                    <span className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-sm font-bold text-flexwhite/95">{v.user.username}</span>
                        {/* The same three tiers the rest of the app shows (see
                            video-card, up-next-sidebar). The feed hands back the
                            EFFECTIVE tier, already null for anyone hiding their
                            badge, so there is nothing extra to check. */}
                        {v.user.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-3.5 shrink-0" />}
                        {v.user.verifiedTier === "business" && <BusinessBadgeIcon className="size-3.5 shrink-0" />}
                        {v.user.verifiedTier === "government" && <GovBadgeIcon className="size-3.5 shrink-0" />}
                    </span>
                )}
                <span
                    className={cn(
                        "line-clamp-2 text-sm font-bold leading-snug",
                        isActive ? "text-white" : "text-flexwhite/75"
                    )}
                >
                    {v.title}
                </span>
                
            </span>
        </button>
        </Squircle>
    );
}

export function HomeRailVideos() {
    const { videos, active, setActiveId, isLoading } = useHomeFeed();

    if (isLoading) {
        return (
            <div className="flex flex-col">
                {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                    <div key={i} className={ROW}>
                        <span className={THUMB} style={staggerPulse(i, SKELETON_COUNT)}>
                            <span className="size-full shimmer-skeleton" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-2">
                            <span
                                className="h-3.5 w-full rounded-full shimmer-skeleton"
                                style={staggerPulse(i, SKELETON_COUNT)}
                            />
                            <span
                                className="h-3.5 w-3/5 rounded-full shimmer-skeleton"
                                style={staggerPulse(i, SKELETON_COUNT)}
                            />
                            <span
                                className="h-3 w-2/5 rounded-full shimmer-skeleton"
                                style={staggerPulse(i, SKELETON_COUNT)}
                            />
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    // The rail is a fixed-height sticky column, so the list scrolls inside it
    // rather than growing the page.
    return (
        <div className="hidden-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
            {videos.map((v) => (
                <RailVideo
                    key={v.id}
                    v={v}
                    isActive={v.id === active?.id}
                    onSelect={() => setActiveId(v.id)}
                />
            ))}
        </div>
    );
}
