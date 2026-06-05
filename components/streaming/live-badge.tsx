"use client";

import { cn } from "@/lib/utils";

interface LiveBadgeProps {
    size?: "sm" | "md" | "lg";
    className?: string;
}

export function LiveBadge({ size = "md", className }: LiveBadgeProps) {
    const sizes = { sm: "text-[9px] px-1.5 py-0.5", md: "text-[10px] px-2 py-0.5", lg: "text-xs px-2.5 py-1" };
    return (
        <span className={cn("inline-flex items-center gap-1 font-black uppercase tracking-wide rounded bg-red-600 text-white", sizes[size], className)}>
            <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            LIVE
        </span>
    );
}
