import { cn } from "@/lib/utils";

/**
 * The day divider for every chat surface.
 *
 * Buzz's shape (`features/messages/ui/DayDivider.tsx`), in our tokens: a small
 * centred pill rather than a label slotted into a horizontal rule.
 *
 * Community chat used the rule version — `h-px flex-1` either side of the text —
 * and it has a specific problem at chat widths: the rules dominate, so the eye
 * reads a horizontal line first and the date second, when the date is the entire
 * content. A pill is one object. DMs had already arrived at a pill
 * independently; this is the two agreeing.
 *
 * ## Sticky is the part worth copying — and it is BLOCKED on flex-col-reverse
 *
 * The label pins to the top of the scroller while its day is on screen, so
 * scrolling back always answers "what day am I reading" without scrolling UP to
 * find a divider you already passed. That is the best thing about buzz's
 * version.
 *
 * ⚠️ It is off in community chat, deliberately. That list is
 * `flex flex-col-reverse`, and measured in the live DOM the two orders are
 * exactly inverted:
 *
 *     DOM order:    Yesterday -> July 30th -> July 16th
 *     visual order: July 16th -> July 30th -> Yesterday
 *
 * `position: sticky` derives its stuck range from FLOW position, not visual
 * position, so each label would pin over the wrong day's messages — the newest
 * divider pinning while you read the oldest. Reversed-flex is a rendering trick
 * for "start scrolled at the bottom"; sticky is one of the things it costs.
 *
 * Phase 6's windowing step already plans to flatten that list to chronological
 * order and drop the reverse (see docs/buzz-adoption-plan.md). Turn `sticky` on
 * for community chat then, not before — and check it against a channel with
 * enough history to actually scroll.
 *
 * `pointer-events-none` on the wrapper so a pinned label never eats a click
 * meant for the message underneath it.
 *
 * Border comes from the centralised slate hairline in globals.css — not a
 * hand-picked colour — and there is no shadow, per the house rule.
 */
export function DayDivider({
    label,
    sticky = false,
    className,
}: {
    label: string;
    /** Pin to the top of the scroll container while this day is on screen. */
    sticky?: boolean;
    className?: string;
}) {
    if (!label) return null;
    return (
        <div
            aria-label={label}
            data-day-label={label}
            className={cn(
                "pointer-events-none flex justify-center py-3",
                sticky && "sticky top-1 z-20",
                className,
            )}
        >
            <span className="rounded-full border border-border bg-canvas px-2.5 py-1 text-xs font-medium tracking-wide text-zinc-500">
                {label}
            </span>
        </div>
    );
}
