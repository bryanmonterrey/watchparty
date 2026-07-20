"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { xpProgress, type XpKind } from "@/lib/xp";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";

interface LevelBadgeProps {
    xp: number;
    /** When set and it's the signed-in user, the badge opens an XP breakdown. */
    userId?: string;
    className?: string;
}

const TICKS = 20;
// Hue sweep for the fill: violet → magenta → red → orange → yellow → green.
const HUE_START = 270;
const HUE_SPAN = 220;

const KIND_LABELS: Record<string, string> = {
    post_created: "Posted",
    comment_created: "Commented",
    like_received: "Got a like",
    follow_received: "New follower",
    token_launched: "Launched a coin",
    referral_converted: "Referral joined",
    prediction_bet: "Backed a prediction",
    perps_trade: "Perps trade",
    callout_2x: "Callout hit 2×",
    callout_5x: "Callout hit 5×",
    callout_10x: "Callout hit 10×",
    quest_completed: "Quest complete",
};

/**
 * Level indicator for the profile header: "LV n" + a segmented tick bar.
 * The rainbow always completes across the filled ticks (progress reads from
 * how many ticks are lit, not where the gradient ends). On your own profile
 * it's a button — click for the recent-XP breakdown.
 */
export function LevelBadge({ xp, userId, className }: LevelBadgeProps) {
    const { level, inLevel, forNext, pct } = xpProgress(xp);
    const filled = Math.max(1, Math.round((pct / 100) * TICKS));
    const { data: session } = useAuthSession();
    const isOwn = !!userId && session?.user?.id === userId;
    const [open, setOpen] = React.useState(false);
    const { data: recent } = trpc.quest.recentXp.useQuery(undefined, { enabled: isOwn && open });

    const bar = (
        <>
            <span className="font-pixel text-xs leading-none text-zinc-400">exp lv{level}</span>
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
        </>
    );
    const title = `Level ${level} — ${inLevel.toLocaleString()} / ${forNext.toLocaleString()} XP to level ${level + 1}`;

    if (!isOwn) {
        return <div className={cn("flex items-center gap-2", className)} title={title}>{bar}</div>;
    }

    return (
        <div className={cn("relative", className)}>
            <button
                onClick={() => setOpen((o) => !o)}
                title={title}
                className="flex cursor-pointer items-center gap-2 rounded-full px-1 py-0.5 transition-colors hover:bg-white/5"
            >
                {bar}
            </button>
            {open && (
                <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-[20px] border border-white/10 bg-[#101011] p-4 shadow-none">
                    <div className="mb-2 flex items-baseline justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Recent XP</span>
                        <span className="text-xs font-semibold text-zinc-400 tabular-nums">
                            {inLevel.toLocaleString()}/{forNext.toLocaleString()} to LV {level + 1}
                        </span>
                    </div>
                    {!recent ? (
                        <div className="shimmer-skeleton h-24 rounded-xl" />
                    ) : recent.events.length === 0 ? (
                        <p className="py-4 text-center text-xs font-semibold text-zinc-500">
                            No XP yet — post, trade, or complete quests to start earning.
                        </p>
                    ) : (
                        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                            {recent.events.map((e, i) => (
                                <div key={i} className="flex items-center justify-between rounded-lg px-1.5 py-1">
                                    <span className="text-xs font-semibold text-zinc-300">
                                        {KIND_LABELS[e.kind as XpKind] ?? e.kind}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        <span className="text-[11px] font-medium text-zinc-500">
                                            {formatDistanceToNow(new Date(e.createdAt), { addSuffix: false })}
                                        </span>
                                        <span className="text-xs font-bold text-lantern tabular-nums">+{e.amount}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
