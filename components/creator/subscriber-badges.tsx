"use client";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Award } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

const TIER_CONFIG = {
    bronze: { color: "text-amber-700", bg: "bg-amber-900/20 border-amber-800/30", label: "Bronze", months: 1 },
    silver: { color: "text-zinc-300", bg: "bg-zinc-800/40 border-zinc-700/30", label: "Silver", months: 3 },
    gold: { color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-700/30", label: "Gold", months: 6 },
    platinum: { color: "text-cyan-300", bg: "bg-cyan-900/20 border-cyan-700/30", label: "Platinum", months: 12 },
    diamond: { color: "text-violet-300", bg: "bg-violet-900/20 border-violet-700/30", label: "Diamond", months: 24 },
} as const;

export function TierBadge({ tier, size = "sm" }: { tier: keyof typeof TIER_CONFIG; size?: "sm" | "md" }) {
    const t = TIER_CONFIG[tier];
    return (
        <span className={cn("inline-flex items-center gap-1 rounded-full border font-bold",
            t.bg, t.color,
            size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"
        )}>
            <Award className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
            {t.label}
        </span>
    );
}

export function SubscriberBadgesManager() {
    const { data, isLoading } = trpc.creator.getMyFollowerBadges.useQuery();

    const tiers = Object.entries(TIER_CONFIG) as [keyof typeof TIER_CONFIG, typeof TIER_CONFIG[keyof typeof TIER_CONFIG]][];

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-white" />
                <h2 className="text-base font-bold text-zinc-100">Subscriber Badges</h2>
            </div>

            {/* Tier info */}
            <div className="grid grid-cols-5 gap-2">
                {tiers.map(([key, t]) => (
                    <div key={key} className={cn("rounded-xl border p-3 text-center space-y-1", t.bg)}>
                        <Award className={cn("w-5 h-5 mx-auto", t.color)} />
                        <p className={cn("text-xs font-bold", t.color)}>{t.label}</p>
                        <p className="text-[10px] text-zinc-600">{t.months}+ mo</p>
                    </div>
                ))}
            </div>

            <p className="text-xs text-zinc-500">
                Badges are automatically awarded to followers based on how long they&apos;ve followed you.
            </p>

            {isLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : !data?.length ? (
                <div className="text-center py-8 space-y-2">
                    <Award className="w-9 h-9 mx-auto text-zinc-700" />
                    <p className="text-sm text-zinc-500">No badge holders yet</p>
                    <p className="text-xs text-zinc-600">Badges are awarded as followers stick around</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs text-zinc-500 font-semibold">{data.length} badge holder{data.length !== 1 ? "s" : ""}</p>
                    {data.map(b => (
                        <div key={b.id} className="flex items-center gap-3 p-3 rounded-[20px] bg-panel">
                            <Link href={`/${b.username}`}>
                                {b.avatar_url
                                    ? <img src={b.avatar_url} className="w-9 h-9 rounded-full object-cover" />
                                    : <img src="/avatar.png" alt="" className="w-9 h-9 rounded-full object-cover" />
                                }
                            </Link>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-zinc-200 truncate">{b.name}</p>
                                <p className="text-xs text-zinc-500">@{b.username} · {b.followMonths} month{b.followMonths !== 1 ? "s" : ""}</p>
                            </div>
                            <TierBadge tier={b.tier as keyof typeof TIER_CONFIG} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
