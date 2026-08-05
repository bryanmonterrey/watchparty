"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Squircle } from "@/components/ui/squircle";
import { RAIL_BORDER } from "@/components/rails/rail-shell";
import { cn } from "@/lib/utils";

// The card the chat menus (Settings, Identity, Members) sit in.
//
// A CARD above the composer, not a full-bleed overlay. These used to be
// `absolute inset-0`, which covered the emote strip, the input and the send row
// as well — so opening settings took the chat away instead of putting something
// in front of it, and there was nothing to type into while it was open.
//
// It's anchored to the BOTTOM of the message area — chat-panel makes that
// region the positioned parent, so `bottom-0` here means "on top of the last
// message", not "on top of the composer" — and grows upward only as far as its
// content needs, capped at that area's height. Short menus are short. Long ones
// stop at the tabs and scroll inside themselves rather than pushing anything
// around, and the emote strip, input and send row stay usable throughout.
//
// radius 25 + RAIL_BORDER are the rail card's own values, so this reads as a
// card of the same family rather than a panel that happens to be rounded. Both
// come from rail-shell, not copied numbers.

export function ChatSheet({
    title,
    subtitle,
    onBack,
    onClose,
    onPrev,
    onNext,
    children,
}: {
    title: string;
    /** Second line under the title, e.g. a leaderboard's reset countdown. */
    subtitle?: string;
    /** Shown only when there's somewhere to go back TO. */
    onBack?: () => void;
    onClose: () => void;
    /** Pager arrows, for a sheet whose title names one of several views. */
    onPrev?: () => void;
    onNext?: () => void;
    children: React.ReactNode;
}) {
    return (
        // mb-2 keeps it off the emote strip below; z-30 clears the paused pill.
        <div className="absolute inset-x-0 bottom-0 z-30 mb-2 flex max-h-full flex-col">
            <Squircle
                radius={25}
                autoEffects={false}
                innerBorder={RAIL_BORDER}
                className="flex max-h-full min-h-0 flex-col bg-canvas"
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

                <div className="hidden-scrollbar min-h-0 overflow-y-auto px-3 pb-3">{children}</div>
            </Squircle>
        </div>
    );
}
