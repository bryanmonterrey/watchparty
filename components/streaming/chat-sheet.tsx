"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// The card the chat menus (Settings, Identity, Members) sit in.
//
// A CARD above the composer, not a full-bleed overlay. These used to be
// `absolute inset-0`, which covered the emote strip, the input and the send row
// as well — so opening settings took the chat away instead of putting something
// in front of it, and there was nothing to type into while it was open.
//
// It runs to the panel's own edges: -mx-2 cancels the chat column's px-2
// (RailCard's CARD_PX) so the card's sides meet the outer card's, rather than
// floating inset from them.
//
// Bottom-anchored sheets reach the panel's bottom edge and RESERVE the
// composer's height as padding, so the card reads as a card instead of a box
// hovering above a gap — chat-panel measures that height and publishes it as
// --chat-composer-h, since the reply banner makes it vary. The composer paints
// over that reserved strip at z-40 and stays usable throughout.
//
// Top-anchored is for a sheet opened from something at the TOP of the panel (the
// leaderboard, from its marquee): it hangs from the header instead, squares its
// top edge and drops the outline, because a stroked top edge there draws a
// second hairline right under the one the header already has.
//
// Either way it grows only as far as its content needs and scrolls inside
// itself past that, rather than pushing anything around.
//
// Chrome differs by anchor, and deliberately. A bottom sheet fills the chat
// column corner to corner and takes neither outline nor rounding — it IS the
// panel while it's open, and an outline inside an outlined card is two hairlines
// a few pixels apart. The leaderboard hangs from the header, so it reads as a
// thing dropped over the chat and gets sides and a bottom edge to say so; its
// top is where the header already draws one.
//
// Plain CSS borders, not the Squircle used elsewhere: Lisse strokes a whole
// path with no per-side control, and border-x + border-b is exactly the
// per-side case it can't express.

export function ChatSheet({
    title,
    subtitle,
    anchor = "bottom",
    onBack,
    onClose,
    onPrev,
    onNext,
    children,
}: {
    title: string;
    /** Second line under the title, e.g. a leaderboard's reset countdown. */
    subtitle?: string;
    /** Which edge the sheet hangs from. Matches whatever opened it. */
    anchor?: "top" | "bottom";
    /** Shown only when there's somewhere to go back TO. */
    onBack?: () => void;
    onClose: () => void;
    /** Pager arrows, for a sheet whose title names one of several views. */
    onPrev?: () => void;
    onNext?: () => void;
    children: React.ReactNode;
}) {
    const top = anchor === "top";

    return (
        <div
            className={cn(
                "absolute inset-x-0 -mx-2 z-30 flex max-h-full flex-col",
                top ? "top-0" : "bottom-0",
            )}
        >
            <div
                className={cn(
                    "flex max-h-full min-h-0 flex-col bg-canvas",
                    top && "rounded-b-[25px] border-x border-b border-[rgba(138,145,158,0.2)]",
                )}
            >
                {/* shrink-0: the header is fixed furniture and the scroller
                    below takes whatever height is left. */}
                <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            aria-label="back"
                            className="cursor-pointer text-zinc-400 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" strokeWidth={2.5} />
                        </button>
                    )}
                    {onPrev && (
                        <button
                            type="button"
                            onClick={onPrev}
                            aria-label="previous"
                            className="cursor-pointer text-zinc-400 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" strokeWidth={2.5} />
                        </button>
                    )}

                    {/* Centred when it's paged, left-aligned otherwise — the
                        arrows need something between them to point at. */}
                    <div className={cn("min-w-0 flex-1", onPrev && "text-center")}>
                        <h2 className="truncate text-[15px] font-bold text-flexwhite">{title}</h2>
                        {subtitle && (
                            <p className="truncate text-[11px] font-medium text-zinc-500">{subtitle}</p>
                        )}
                    </div>

                    {onNext && (
                        <button
                            type="button"
                            onClick={onNext}
                            aria-label="next"
                            className="cursor-pointer text-zinc-400 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" strokeWidth={2.5} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="close"
                        className="cursor-pointer text-zinc-400 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2.5} />
                    </button>
                </div>

                {/* Bottom sheets clear the composer with its measured height;
                    top sheets have nothing below them to clear. */}
                <div
                    className={cn(
                        "hidden-scrollbar min-h-0 overflow-y-auto px-3",
                        top ? "pb-3" : "pb-[calc(var(--chat-composer-h,7rem)+0.75rem)]",
                    )}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
