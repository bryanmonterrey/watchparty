"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { GiftIcon, StarIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { Marquee } from "@/components/ui/marquee";
import { cn } from "@/lib/utils";

// The top-gifters strip under the tabs. Tapping it opens the full board.
//
// A marquee rather than a truncated row because the interesting part is the
// RANKING, and a strip that fits two names always shows the same two — the
// people already winning. Scrolling puts everyone who placed in front of the
// room, which is the point of having a board at all.
//
// With nobody on the board it becomes the invitation to start one, and switches
// motion with it: the ranking scrolls continuously because it's a list you dip
// into, while the invitation runs twice and then rests. A call to action that
// never stops moving is wallpaper within a minute.

const MEDAL: Record<number, string> = {
    1: "bg-[#f5b31b] text-black",
    2: "bg-[#c7ccd4] text-black",
    3: "bg-[#c0793f] text-black",
};

const NAME_TONE: Record<number, string> = {
    1: "text-[#f5b31b]",
    2: "text-flexwhite",
    3: "text-[#e08b46]",
};

export function ChatGifterMarquee({
    hostUserId,
    onOpen,
}: {
    hostUserId: string;
    onOpen: () => void;
}) {
    const { data } = trpc.stream.topGifters.useQuery(
        { creatorId: hostUserId, period: "weekly", limit: 10 },
        { staleTime: 60_000 },
    );

    // Still loading — no strip yet rather than a flash of the empty state.
    if (!data) return null;

    if (data.rows.length === 0) {
        return (
            <button
                type="button"
                onClick={onOpen}
                aria-label="leaderboard"
                className="w-full cursor-pointer overflow-hidden border-b border-[rgba(138,145,158,0.2)] py-1.5 transition-colors hover:bg-white/[0.04]"
            >
                <Marquee burst pauseOnHover repeat={4} className="[--duration:26s] [--gap:3rem]">
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-zinc-400">
                        <HugeiconsIcon icon={StarIcon} className="size-4 shrink-0 text-[#f5b31b]" strokeWidth={2} />
                        Gift
                        <HugeiconsIcon icon={GiftIcon} className="size-4 shrink-0" strokeWidth={2} />
                        1 sub or more to enter the leaderboard
                    </span>
                </Marquee>
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label="top gifters"
            className="w-full cursor-pointer overflow-hidden border-b border-[rgba(138,145,158,0.2)] py-1.5 transition-colors hover:bg-white/[0.04]"
        >
            {/* repeat=2 with a short list still fills the track, and pausing on
                hover means a name you want to read stops moving under you. */}
            <Marquee pauseOnHover repeat={3} className="[--duration:26s] [--gap:1.5rem]">
                {data.rows.map((r) => (
                    <span key={r.userId} className="flex items-center gap-1.5">
                        <span
                            className={cn(
                                "flex size-[18px] shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                                MEDAL[r.rank] ?? "text-zinc-500",
                            )}
                        >
                            {r.rank}
                        </span>
                        <span className={cn("text-[13px] font-bold", NAME_TONE[r.rank] ?? "text-flexwhite")}>
                            {r.username ?? r.name}
                        </span>
                        <span className="flex items-center gap-0.5 text-[13px] font-bold text-zinc-500 tabular-nums">
                            {r.gifts}
                            <HugeiconsIcon icon={GiftIcon} className="size-3.5" strokeWidth={2} />
                        </span>
                    </span>
                ))}
            </Marquee>
        </button>
    );
}
