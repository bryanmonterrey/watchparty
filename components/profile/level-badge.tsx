"use client";

import { xpProgress } from "@/lib/xp";
import { cn } from "@/lib/utils";

interface LevelBadgeProps {
    xp: number;
    className?: string;
}

/** Level pill for the profile header. Progress bar fills toward the next level. */
export function LevelBadge({ xp, className }: LevelBadgeProps) {
    const { level, inLevel, forNext, pct } = xpProgress(xp);
    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-full border border-flexborder/50 bg-black/25 px-3 py-1.5",
                className,
            )}
            title={`${inLevel.toLocaleString()} / ${forNext.toLocaleString()} XP to level ${level + 1}`}
        >
            <span className="font-pixel text-xs leading-none text-lantern">LV {level}</span>
            <span className="h-1 w-8 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-lantern" style={{ width: `${pct}%` }} />
            </span>
        </div>
    );
}
