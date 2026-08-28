"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { GooDropdown, gooMenuItem } from "@/components/ui/goo-dropdown";
import { RetweetIcon, QuoteIcon } from "@/components/icons";

interface RepostMenuProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reposted: boolean;
    repostCount: number;
    onRepostClick: (e: React.MouseEvent) => void;
    onDoRepost: () => void;
    onDoQuote: () => void;
    className?: string;
    buttonClassName?: string;
    iconSize?: string;
    hideCountAtZero?: boolean;
}

export function RepostMenu({
    open,
    onOpenChange,
    reposted,
    repostCount,
    onDoRepost,
    onDoQuote,
    className,
    buttonClassName,
    iconSize = "w-[18px] h-[18px]",
    hideCountAtZero = true,
}: RepostMenuProps) {
    const active = reposted || open;

    return (
        <GooDropdown
            className={className}
            open={open}
            onOpenChange={onOpenChange}
            side="top"
            align="start"
            width={192}
            gap={8}
            stopPropagation
            triggerAriaLabel="Repost"
            triggerClassName={cn(
                "flex items-center gap-1 cursor-pointer group/btn transition-colors",
                active ? "text-emerald-500" : "text-postgray",
                "hover:text-emerald-500",
                buttonClassName
            )}
            trigger={
                <>
                    <span className="p-2 rounded-full transition-colors flex items-center justify-center hover:bg-emerald-500/10">
                        <RetweetIcon className={iconSize} />
                    </span>
                    <span
                        className={cn(
                            "text-[13px] -ml-1 min-w-[2ch] tracking-tight tabular-nums transition-opacity duration-200",
                            repostCount === 0 && hideCountAtZero
                                ? "opacity-0 select-none"
                                : active
                                    ? "text-emerald-500"
                                    : "text-postgray"
                        )}
                    >
                        {repostCount === 0 && hideCountAtZero ? "" : repostCount}
                    </span>
                </>
            }
            // Standard rows (gooMenuItem), same as the dots and share menus on
            // this card — not a hand-rolled pill row with its own hover fill.
            items={[
                gooMenuItem({ key: "repost", icon: <RetweetIcon />, label: reposted ? "Undo repost" : "Repost", onClick: onDoRepost }),
                gooMenuItem({ key: "quote", icon: <QuoteIcon />, label: "Quote", onClick: onDoQuote }),
            ]}
        />
    );
}
