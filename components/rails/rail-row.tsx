"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { Squircle } from "@/components/ui/squircle";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { ViewsStat } from "@/components/ui/views-stat";

// One rail row for the whole app — home's picker, the video page's up-next and
// the live page's list are the same object doing three jobs, so they're one
// component. Home selects (a button), the others navigate (a link).
//
// h-28 rows: a 16:9 thumbnail at that height would be ~199px wide and leave
// almost nothing for text in a 300px rail, so the thumbnail is fixed at 85px
// (still 16:9) and the info takes the rest.
export const RAIL_ROW = "flex h-fit p-2 w-full items-start justify-start gap-3 text-left transition-colors";
export const RAIL_THUMB = "relative h-[45px] w-[85px] shrink-0 overflow-hidden rounded-xs bg-muted";

/** Thumb width + the row's gap-3 — what the extra lines indent to so they sit
 *  under the text column rather than under the thumbnail. */
const INFO_INDENT = "pl-[97px]";

interface RailRowProps {
    thumbnailUrl?: string | null;
    isLive?: boolean | null;
    username?: string | null;
    /** Already the EFFECTIVE tier — null for anyone hiding their badge. */
    verifiedTier?: string | null;
    title?: string | null;
    /** Sits after the badge on the identity line. Omit to leave it off. */
    views?: number | null;
    /** Row-level menu, rendered on its own line at the end. */
    menu?: React.ReactNode;
    /** Home's picker: the row that's currently the hero. */
    isActive?: boolean;
    /** Navigates. Mutually exclusive with onSelect — pass one. */
    href?: string;
    /** Selects in place. */
    onSelect?: () => void;
}

export function RailRow({
    thumbnailUrl,
    isLive,
    username,
    verifiedTier,
    title,
    views,
    menu,
    isActive,
    href,
    onSelect,
}: RailRowProps) {
    const info = (
        <>
            <span className={RAIL_THUMB}>
                {thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
                )}
                {isLive && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Live
                    </span>
                )}
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-0.2">
                <span
                    className={cn(
                        "line-clamp-2 text-sm font-bold leading-snug",
                        isActive ? "text-white" : "text-flexwhite/75",
                    )}
                >
                    {title}
                </span>
                {username && (
                    <span className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-sm font-bold text-flexwhite/95">{username}</span>
                        {verifiedTier === "verified" && <VerifiedBadgeIcon className="size-3.5 shrink-0" />}
                        {verifiedTier === "business" && <BusinessBadgeIcon className="size-3.5 shrink-0" />}
                        {verifiedTier === "government" && <GovBadgeIcon className="size-3.5 shrink-0" />}
                    </span>
                )}
                {/* Its own line under the identity, a step up in size from the
                    12px it had while it shared the username's row. Renders
                    nothing without a count, so the line can't sit empty. */}
                <ViewsStat
                    views={views}
                    className="mt-0.5 text-[13px] font-medium text-flexwhite/50"
                    iconClassName="size-4"
                />
            </span>
        </>
    );

    // The menu is a real button, so it CANNOT live inside the row's own
    // button/link — nesting them would be invalid HTML and its clicks would
    // fight the row's. So the click target wraps the thumb and text only, and
    // the menu is a sibling under it. With no menu the result is identical to
    // what this row has always been: a full-width target with the hover/active
    // fill, just carried by the wrapper instead of the target itself.
    const hasExtras = !!menu;
    const target = cn(RAIL_ROW, "cursor-pointer p-0");

    return (
        <Squircle asChild radius={12} autoEffects={false}>
            <div
                className={cn(
                    "flex h-fit w-full flex-col p-2 transition-colors",
                    isActive ? "bg-sidebar-hover/85" : "hover:bg-sidebar-hover-35/60",
                )}
            >
                {href ? (
                    <Link href={href} className={target}>
                        {info}
                    </Link>
                ) : (
                    <button type="button" onClick={onSelect} aria-pressed={isActive} className={target}>
                        {info}
                    </button>
                )}

                {hasExtras && (
                    <div className={cn("flex flex-col", INFO_INDENT)}>
                        <div className="flex justify-end">{menu}</div>
                    </div>
                )}

            </div>
        </Squircle>
    );
}

/** The rail's loading state — same geometry as a real row, staggered per the
 *  app's one skeleton standard. */
export function RailRowSkeleton({ index, count }: { index: number; count: number }) {
    const pulse = staggerPulse(index, count);
    return (
        <div className={RAIL_ROW}>
            <span className={RAIL_THUMB} style={pulse}>
                <span className="size-full shimmer-skeleton" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="h-3.5 w-full rounded-xs shimmer-skeleton" style={pulse} />
                <span className="h-3.5 w-3/5 rounded-xs shimmer-skeleton" style={pulse} />
            </span>
        </div>
    );
}
