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
    /** Optional home-only hover tint. Other rails keep the neutral shared fill. */
    hoverColor?: string;
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
    hoverColor,
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
            </span>
        </>
    );

    // The menu is a real button, so it CANNOT live inside the row's own
    // button/link — nesting them would be invalid HTML and its clicks would
    // fight the row's. So the click target wraps the thumb and text only, and
    // the line below it carries the view count and the menu together.
    //
    // That left the row's padding and the views/menu line dead: you had to hit
    // the thumb or the title for the row to do anything. `after:inset-0` fixes
    // it without nesting anything — the target grows an invisible pseudo-element
    // that covers the WRAPPER (its containing block, since the wrapper is
    // `relative` and the target isn't), so a click anywhere in the row lands on
    // the real button or link. The pseudo-element carries no content and isn't
    // focusable, so keyboard and screen-reader behaviour are untouched.
    //
    // The extras line is lifted above it — see the z-10 there.
    const hasExtras = !!menu || views != null;
    const target = cn(RAIL_ROW, "cursor-pointer p-0", "after:absolute after:inset-0 after:content-['']");

    return (
        <Squircle asChild radius={12} autoEffects={false}>
            <div
                // The row itself selects, not just the button inside it.
                //
                // The stretched ::after below was supposed to make the whole row
                // a target, but anything painted above it isn't covered — the
                // views/menu line is deliberately `z-10` so the menu stays
                // clickable — and in practice you had to hit the thumb or the
                // title. Handling the click here is unconditional: every pixel
                // of the row, whatever is painted over it.
                //
                // Only for the onSelect flavour. The href flavour is a real
                // <Link>, and a wrapper click would be a second, worse way to
                // navigate (no middle-click, no open-in-new-tab).
                onClick={onSelect}
                className={cn(
                    // `relative` is what the target's stretched ::after resolves
                    // against, so it's load-bearing for the row being clickable
                    // at all — not just a positioning context for the hover
                    // tint. cursor-pointer matches that whole-row target.
                    "group/rail-hover relative flex h-fit w-full cursor-pointer flex-col p-2 transition-colors",
                    // With a palette colour the overlay below carries BOTH
                    // states, so no neutral fill here — one painted on top of
                    // the other would muddy the tint. Rails without one (the
                    // watch and live lists) keep the neutral pair.
                    !hoverColor && (isActive ? "bg-sidebar-hover/85" : "hover:bg-sidebar-hover-35/60"),
                )}
            >
                {/* The row's palette tint. Active wears it permanently — the
                    active row is the hover colour, made to stay — and every
                    other row fades it in on hover at the same strength. */}
                {hoverColor && (
                    <span
                        aria-hidden
                        style={{ backgroundColor: hoverColor }}
                        className={cn(
                            "pointer-events-none absolute inset-0 transition-opacity duration-200",
                            isActive ? "opacity-10" : "opacity-0 group-hover/rail-hover:opacity-10",
                        )}
                    />
                )}
                {href ? (
                    <Link href={href} className={target}>
                        {info}
                    </Link>
                ) : (
                    <button type="button" onClick={onSelect} aria-pressed={isActive} className={target}>
                        {info}
                    </button>
                )}

                {/* One line at the end: the view count sits directly left of the
                    menu, both marks at size-5 so they read as a pair.

                    relative z-10 lifts this above the target's stretched
                    ::after — without it the overlay would swallow the menu's
                    clicks and opening a row's menu would just select the row. */}
                {hasExtras && (
                    <div
                        // The menu lives here, so a click that lands on it must
                        // not also select the row on its way up to the wrapper.
                        onClick={(e) => e.stopPropagation()}
                        className={cn("relative z-10 flex items-center justify-end gap-1.5", INFO_INDENT)}
                    >
                        <ViewsStat
                            views={views}
                            className="text-sm font-medium text-flexwhite/50"
                            iconClassName="size-5"
                        />
                        {menu}
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
