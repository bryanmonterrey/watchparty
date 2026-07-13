"use client";

import { xpProgress } from "@/lib/xp";
import { cn } from "@/lib/utils";

interface LevelBadgeProps {
    xp: number;
    className?: string;
}

const TICKS = 20;
// Hue sweep for the fill: violet → magenta → red → orange → yellow → green.
const HUE_START = 270;
const HUE_SPAN = 220;

/**
 * Level indicator for the profile header: "LV n" + a segmented tick bar.
 * The rainbow always completes across the filled ticks (progress reads from
 * how many ticks are lit, not where the gradient ends).
 */
export function LevelBadge({ xp, className }: LevelBadgeProps) {
    const { level, inLevel, forNext, pct } = xpProgress(xp);
    // At least one lit tick so a fresh level never renders an all-gray bar.
    const filled = Math.max(1, Math.round((pct / 100) * TICKS));

    return (
        <div
            className={cn("flex items-center gap-2", className)}
            title={`Level ${level} — ${inLevel.toLocaleString()} / ${forNext.toLocaleString()} XP to level ${level + 1}`}
        >
            <span className="font-pixel text-xs leading-none text-zinc-400">LV {level}</span>
            <div className="flex items-center gap-[3px]">
                {Array.from({ length: TICKS }, (_, i) => (
                    <span
                        key={i}
                        className={cn("h-2.5 w-[3px] rounded-full", i >= filled && "bg-white/15")}
                        style={
                            i < filled
                                ? { background: `hsl(${(HUE_START + (i / Math.max(1, filled - 1)) * HUE_SPAN) % 360} 90% 62%)` }
                                : undefined
                        }
                    />
                ))}
            </div>
        </div>
    );
}
