"use client";

import Link from "next/link";
import { RailShell } from "@/components/rails/rail-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { useForceLoading } from "@/lib/debug-loading";

// "What's happening" under home's video rail — the same GLM coin-news card the
// feed's right rail carries (components/browse/discover-right-rail, NewsCard),
// rebuilt on RailShell so it wears home's rail chrome rather than the feed's.
//
// Width comes from the <aside> it shares with the video rail, so the two match
// by construction rather than by a number repeated in two places.
//
// shrink-0 at the call site, video rail flex-1: the column is a fixed
// h-[100svh], so this card keeps its natural height at the bottom and the video
// list scrolls in whatever is left.

const ROWS = 4;
// Matches HomeRailVideos' card exactly — same radius, same outline, same header
// inset — so the two read as one stack rather than two designs.
const CARD_HEADER_PAD = "px-3 pt-3 pb-2";
const CARD_PX = "px-2";

function NewsRowSkeleton() {
    return (
        <div className="w-full space-y-1.5 px-2 py-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
        </div>
    );
}

function NewsRow({ title, meta, ticker, tokenAddress }: { title: string; meta: string; ticker?: string; tokenAddress?: string | null }) {
    // Deep-link to the coin when we know it, else search the ticker — same
    // resolution the feed rail's row uses.
    const href = tokenAddress
        ? `/coin/${tokenAddress}`
        : ticker
            ? `/feed/search?q=${encodeURIComponent("$" + ticker)}`
            : "/trade";
    return (
        <Link
            href={href}
            className="block w-full rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
        >
            <p className="text-[13px] text-muted-foreground">{meta}</p>
            <p className="line-clamp-2 text-[15px] font-bold leading-snug">{title}</p>
        </Link>
    );
}

export function HomeRailNews() {
    const { data, isLoading } = trpc.discover.trending.useQuery({ limit: ROWS }, { staleTime: 300_000 });
    const forceLoading = useForceLoading();

    const header = (
        <div className={CARD_HEADER_PAD}>
            <h2 className="text-lg font-semibold tracking-tight text-white">What&apos;s happening</h2>
        </div>
    );

    if (isLoading || forceLoading) {
        return (
            <RailShell className="mb-0 shrink-0 flex-none" radius={25} bordered header={header}>
                <div className={CARD_PX}>
                    {Array.from({ length: ROWS }).map((_, i) => (
                        <NewsRowSkeleton key={i} />
                    ))}
                </div>
            </RailShell>
        );
    }

    // Self-hides when empty, like the feed rail's cards — an outlined box with
    // nothing in it is worse than no box, and this upstream can legitimately
    // return nothing (see discover.trending's "empty" source).
    if (!data || data.items.length === 0) return null;

    return (
        <RailShell className="mb-0 shrink-0 flex-none" radius={25} bordered header={header}>
            <div className={CARD_PX}>
                {data.items.map((item, i) => (
                    <NewsRow key={i} {...item} />
                ))}
            </div>
        </RailShell>
    );
}
