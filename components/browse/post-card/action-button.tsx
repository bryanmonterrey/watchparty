"use client";

import React from "react";
import { cn, compactCount } from "@/lib/utils";
import { PopNumber } from "@/components/ui/pop-number";

interface ActionButtonProps {
    icon: React.ReactNode;
    count?: number;
    hoverColor?: string;
    hoverBg?: string;
    onClick?: (e: React.MouseEvent) => void;
    active?: boolean;
    activeColor?: string;
    className?: string;
    iconClassName?: string;
    hideCountAtZero?: boolean;
}

export function ActionButton({
    icon,
    count,
    hoverColor = "hover:text-zinc-100",
    hoverBg = "hover:bg-white/10",
    onClick,
    active = false,
    activeColor,
    className,
    iconClassName,
    hideCountAtZero = true,
}: ActionButtonProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-1 cursor-pointer group/btn transition-colors",
                active && activeColor ? activeColor : "text-postgray",
                hoverColor,
                className
            )}
        >
            <div className={cn(
                "p-2 rounded-full transition-colors flex items-center justify-center",
                hoverBg,
                iconClassName
            )}>
                {icon}
            </div>
            {count !== undefined && (
                <span className={cn(
                    "text-[13px] -ml-1 min-w-[2ch] tracking-tight tabular-nums transition-opacity duration-200",
                    (count === 0 && hideCountAtZero) ? "opacity-0 select-none" : (active && activeColor ? activeColor : "text-postgray")
                )}>
                    {/* Shortened, so the bar's view count reads the same as the
                        stat above it — and so a six-figure count can't stretch
                        the row. Pops on change: a like is the clearest case of a
                        number moving under the user. */}
                    {(count === 0 && hideCountAtZero) ? "" : <PopNumber value={compactCount(count)} />}
                </span>
            )}
        </button>
    );
}
