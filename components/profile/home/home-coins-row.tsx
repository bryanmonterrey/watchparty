"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";
import { CoinImage } from "@/components/coins/coin-image";
import { compactUsd } from "@/components/trending/trending-format";
import { cn } from "@/lib/utils";

// Home's coins row — the videos row's shape (lead card + a scrolling rail)
// with the person's coins as square tiles: art, ticker, market cap. Live
// coins first; a draft tile says so instead of a number. "Show all" is the
// Coins tab, where the table is. Owner (2026-10-04): make the coins easier
// to see on the profile, cute, not overdone — so a row, not a second table.
export function HomeCoinsRow({ userId, onViewAll }: { userId: string; onViewAll?: () => void }) {
    const { data, isLoading } = trpc.trade.listByCreator.useQuery({ creatorId: userId, limit: 12 }, { staleTime: 60_000 });
    const coins = data ?? [];

    if (isLoading) {
        return (
            <div className="mx-[calc((max((100cqw_-_1400px)/2,0px)_+_2rem)*-1)] flex gap-4 overflow-hidden px-[calc(max((100cqw_-_1400px)/2,0px)_+_2rem)]">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="shimmer-skeleton size-[150px] shrink-0 rounded-[20px]" />
                ))}
            </div>
        );
    }
    if (!coins.length) return null;

    return (
        <div className="mx-[calc((max((100cqw_-_1400px)/2,0px)_+_2rem)*-1)]">
            <div className="flex gap-4 overflow-x-auto px-[calc(max((100cqw_-_1400px)/2,0px)_+_2rem)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Squircle asChild radius={20}>
                    <div className="flex size-[150px] shrink-0 flex-col items-start justify-between bg-panel2 p-5">
                        <h3 className="font-pixel text-2xl leading-[1.15] text-white">Coins</h3>
                        <button
                            onClick={onViewAll}
                            className="h-11 shrink-0 cursor-pointer rounded-full bg-white px-4 text-sm font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98]"
                        >
                            Show all
                        </button>
                    </div>
                </Squircle>
                {coins.map((c) => {
                    const live = c.status === "live";
                    return (
                        <Link key={c.id} href={`/coin/${c.tokenAddress ?? c.id}`} className="group block shrink-0">
                            <Squircle asChild radius={20}>
                                <div className="relative size-[150px] overflow-hidden bg-zinc-900">
                                    <CoinImage src={c.imageUrl} className="size-full object-cover" />
                                    {/* Flat wash, no gradient (house rule) — the text sits in its own pill. */}
                                    <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2">
                                        <span className="truncate rounded-full bg-black/55 px-2.5 py-1 text-12 font-bold text-white backdrop-blur-md">
                                            ${c.ticker}
                                        </span>
                                        <span
                                            className={cn(
                                                "shrink-0 rounded-full px-2 py-1 text-11 font-bold backdrop-blur-md",
                                                live ? "bg-black/55 text-lantern" : "bg-black/55 text-zinc-300",
                                            )}
                                        >
                                            {live ? compactUsd(c.marketCapUsd) : "draft"}
                                        </span>
                                    </div>
                                </div>
                            </Squircle>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
