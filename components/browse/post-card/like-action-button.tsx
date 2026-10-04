"use client";

import React, { useEffect, useRef } from "react";
import { cn, compactCount } from "@/lib/utils";
import { PopNumber } from "@/components/ui/pop-number";
import { HeartIcon } from "@/components/icons";
import { useBurst } from "@/hooks/use-burst";

// The post card's heart, wearing the transitions.dev like button (the
// `.t-like*` rules in globals.css, the same ones the home video header's
// LikeButton uses): the outline fills red, the icon spring-pops, and eight
// dots burst out — on the way IN only; unliking just reverses the fill.
//
// Same geometry as ActionButton (p-2 icon well, -ml-1 count) so it lines up
// with the comment / repost / views buttons beside it. Always the OUTLINE
// heart: the snippet animates the path's fill itself, so swapping in
// HeartFilledIcon would skip the transition.
//
// The burst keys off `liked` rising, not the click: the card owns the
// optimistic state (and rolls it back on error), so this stays a pure view.
export function LikeActionButton({
    liked,
    count,
    onClick,
    size = 18,
    className,
    idleClassName = "text-postgray",
}: {
    liked: boolean;
    count?: number;
    onClick?: (e: React.MouseEvent) => void;
    /** Icon box in px — 18 in the action row, 20 in the expanded-media views. */
    size?: number;
    className?: string;
    /** Resting text colour (the expanded views sit on media and read lighter). */
    idleClassName?: string;
}) {
    const { bursting, particles, fire } = useBurst();
    const wasLiked = useRef(liked);
    useEffect(() => {
        if (liked && !wasLiked.current) fire();
        wasLiked.current = liked;
    }, [liked, fire]);

    const showCount = count !== undefined && count > 0;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={liked}
            aria-label={liked ? "Unlike" : "Like"}
            data-liked={liked}
            className={cn(
                "t-like flex cursor-pointer items-center gap-1 transition-colors hover:text-red1 group/btn",
                liked ? "text-red1" : idleClassName,
                bursting && "is-bursting",
                className,
            )}
        >
            {/* relative: the particle layer anchors to the ICON well, not the
                whole button, so the burst centres on the heart and not on the
                heart-plus-count. */}
            <div className="relative flex items-center justify-center rounded-full p-2 transition-colors hover:bg-white/10">
                <span className="t-like-icon flex">
                    <HeartIcon className="t-like-heart" style={{ width: size, height: size }} />
                </span>
                <span className="t-like-particles" aria-hidden>
                    {particles.map((style, i) => (
                        <i key={i} style={style} />
                    ))}
                </span>
            </div>
            {count !== undefined && (
                <span
                    className={cn(
                        "-ml-1 min-w-[2ch] text-13 tracking-tight tabular-nums transition-opacity duration-200",
                        showCount ? (liked ? "text-red1" : idleClassName) : "select-none opacity-0",
                    )}
                >
                    {showCount ? <PopNumber value={compactCount(count)} /> : ""}
                </span>
            )}
        </button>
    );
}
