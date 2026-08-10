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
 * ## Sticky is the part worth copying
 *
 * The label pins to the top of the scroller while its day is on screen, so
 * scrolling back through a channel always answers "what day am I reading" — you
 * never have to scroll UP to find the divider you already passed. `sticky` is
 * opt-in because it needs a positioned scroll container to stick to, and not
 * every list has one.
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
            <span className="rounded-full border bg-canvas px-2.5 py-1 text-xs font-medium tracking-wide text-zinc-500">
                {label}
            </span>
        </div>
    );
}
