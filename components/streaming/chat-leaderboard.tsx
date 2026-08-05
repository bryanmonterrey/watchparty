"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GiftIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { Button } from "@/components/ui/button";
import { ChatSheet } from "./chat-sheet";
import { cn } from "@/lib/utils";

// Top gifters, opened from the marquee.
//
// Denominated in GIFT SUBS, because that's the only thing this app can honestly
// rank right now — gift_subscriptions is real and populated; there is no chat
// currency to count. When one exists the board gains a unit, not a rewrite.

const PERIODS = ["weekly", "monthly", "yearly", "lifetime"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABEL: Record<Period, string> = {
    weekly: "Weekly top Gifters",
    monthly: "Monthly top Gifters",
    yearly: "Yearly top Gifters",
    lifetime: "All-time top Gifters",
};

/**
 * Medal colours for the top three. Everyone else gets a plain numeral, which is
 * what makes the top three read as places rather than as list positions.
 */
const MEDAL: Record<number, string> = {
    1: "bg-[#f5b31b] text-black",
    2: "bg-[#c7ccd4] text-black",
    3: "bg-[#c0793f] text-black",
};

/** Top three names carry the medal's warmth; the rest are plain. */
const NAME_TONE: Record<number, string> = {
    1: "text-[#f5b31b]",
    2: "text-flexwhite",
    3: "text-[#e08b46]",
};

function resetLabel(resetsAt: string | null): string | undefined {
    if (!resetsAt) return undefined;
    const ms = new Date(resetsAt).getTime() - Date.now();
    if (ms <= 0) return "Resetting now";
    const days = Math.floor(ms / 864e5);
    if (days >= 1) return `Resets in ${days} day${days === 1 ? "" : "s"}`;
    const hours = Math.max(1, Math.floor(ms / 36e5));
    return `Resets in ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function ChatLeaderboard({
    hostUserId,
    onClose,
}: {
    hostUserId: string;
    onClose: () => void;
}) {
    const [index, setIndex] = useState(0);
    const period = PERIODS[index];

    const { data, isLoading } = trpc.stream.topGifters.useQuery(
        { creatorId: hostUserId, period },
        { staleTime: 60_000 },
    );

    // Wraps, so the arrows never dead-end on the first or last period.
    const step = (delta: number) => setIndex((i) => (i + delta + PERIODS.length) % PERIODS.length);

    return (
        <ChatSheet
            // Hangs from the header, because that's where the marquee that opens
            // it lives — a board that dropped in from the bottom would leave the
            // control you tapped stranded at the far end of the panel.
            anchor="top"
            title={PERIOD_LABEL[period]}
            subtitle={resetLabel(data?.resetsAt ?? null)}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={onClose}
        >
            {isLoading && (
                <div className="flex flex-col gap-1.5 py-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-9 rounded-lg bg-soft-gray-10" />
                    ))}
                </div>
            )}

            {data && data.rows.length === 0 && (
                <p className="py-6 text-center text-sm font-medium text-zinc-400">
                    No one has gifted yet — gift 1 sub to top the leaderboard
                </p>
            )}

            {data?.rows.map((r) => (
                <MiniProfile key={r.userId} userId={r.userId} giftCreatorId={hostUserId} triggerClassName="block">
                    <div className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-white/[0.06]">
                        <span
                            className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                                MEDAL[r.rank] ?? "text-zinc-500",
                            )}
                        >
                            {r.rank}
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate text-sm font-bold", NAME_TONE[r.rank] ?? "text-flexwhite")}>
                            {r.username ?? r.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-zinc-400 tabular-nums">
                            {r.gifts}
                            <HugeiconsIcon icon={GiftIcon} className="size-4" strokeWidth={2} />
                        </span>
                    </div>
                </MiniProfile>
            ))}

            {data?.target && (
                <div className="mt-3 border-t border-[rgba(138,145,158,0.2)] pt-3 text-center">
                    <p className="text-[13px] font-medium text-zinc-400">
                        Gift {data.target.needed} sub{data.target.needed === 1 ? "" : "s"} to take{" "}
                        {ordinal(data.target.rank)}
                    </p>
                    <Button className="mt-2 w-full bg-white text-[15px] font-bold text-black hover:bg-white/85">
                        <HugeiconsIcon icon={GiftIcon} className="size-5" strokeWidth={2.5} />
                        Gift {data.target.needed} sub{data.target.needed === 1 ? "" : "s"}
                    </Button>
                </div>
            )}
        </ChatSheet>
    );
}

function ordinal(n: number): string {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
