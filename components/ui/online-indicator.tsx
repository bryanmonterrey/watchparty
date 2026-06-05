"use client";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

interface OnlineIndicatorProps {
    userId: string;
    className?: string;
    size?: "sm" | "md";
}

export function OnlineIndicator({ userId, className, size = "sm" }: OnlineIndicatorProps) {
    const { data } = trpc.user.getOnlineStatus.useQuery({ userId }, { refetchInterval: 60_000 });
    if (!data?.isOnline) return null;
    return (
        <span className={cn(
            "rounded-full bg-lantern border-2 border-zinc-950",
            size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3",
            className
        )} />
    );
}
