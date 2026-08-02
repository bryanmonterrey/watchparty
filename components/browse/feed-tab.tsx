"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface FeedTabProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
    suffix?: ReactNode;
    className?: string;
}

// A feed tab. The active one is a filled pill; the rest are plain text, and the
// row packs to the left rather than each tab taking an equal share of the bar.
//
// The pill is a shared-layout element, not a background on the button: with one
// `layoutId` across the bar's tabs it travels from the old tab to the new one on
// switch instead of blinking out and in. That's what the underline it replaces
// used to do.
//
// h-13 is held even though the tabs no longer stretch — it's the bar's height,
// and browse-feed's floating "new posts" pill is offset against it in pixels.
export function FeedTab({ label, isActive, onClick, suffix, className }: FeedTabProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "group flex h-13 w-fit shrink-0 cursor-pointer items-center bg-canvas px-1.5",
                className,
            )}
        >
            <span className="relative flex items-center gap-1 rounded-full px-3.5 py-1.5">
                {isActive && (
                    <motion.span
                        layoutId="feed-tab-pill"
                        transition={{ type: "spring", stiffness: 550, damping: 45 }}
                        className="absolute inset-0 rounded-full bg-twitter/15"
                    />
                )}
                {/* Above the pill: it's absolutely positioned, so without a
                    positioned label the fill would paint over the text. */}
                <span
                    className={cn(
                        "relative text-[15px] font-semibold transition-colors",
                        isActive ? "text-twitter2" : "text-zinc-500 group-hover:text-zinc-300",
                    )}
                >
                    {label}
                </span>
                {suffix && <span className="relative flex items-center">{suffix}</span>}
            </span>
        </button>
    );
}
