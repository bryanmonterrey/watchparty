"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon, CalendarIcon } from "@/components/icons";
import { BadgeStrip } from "./badge-strip";
import { LevelBadge } from "./level-badge";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { Button } from "@/components/ui/button";

// Avatar-anchored mini-profile popout (docs/design-brief-2026-07.md §1) —
// the Discord move: identity renders anywhere an avatar appears, so every
// leaderboard row / callout / feed item becomes a follow surface. One batched
// profile.card query (server-cached 5 min; staleTime keeps row-hover cheap),
// hover-intent 150 ms. Depth = flat fill + uniform inner hairline, no shadows.

const CARD_STALE_MS = 5 * 60 * 1000;

function pnlChip(pnl: { realizedUsd: number; winRate: number | null }) {
    const sign = pnl.realizedUsd >= 0;
    const usd = Math.abs(pnl.realizedUsd) >= 1000
        ? `$${(Math.abs(pnl.realizedUsd) / 1000).toFixed(1)}K`
        : `$${Math.abs(pnl.realizedUsd).toFixed(0)}`;
    return (
        <span className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums",
            sign ? "bg-lantern/15 text-lantern" : "bg-red-500/15 text-red-400",
        )}>
            7d {sign ? "+" : "−"}{usd}
            {pnl.winRate != null && <span className="opacity-70">· {Math.round(pnl.winRate * 100)}% win</span>}
        </span>
    );
}

export function MiniProfile({ userId, username, children, triggerClassName }: {
    userId?: string | null;
    username?: string | null;
    children: React.ReactNode;
    /** Layout class for the trigger wrapper — rows in tight flex layouts pass "min-w-0". */
    triggerClassName?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const enabled = !!(userId || username);
    const { data: card, isLoading } = trpc.profile.card.useQuery(
        { userId: userId || undefined, username: username || undefined },
        { enabled: enabled && open, staleTime: CARD_STALE_MS },
    );

    const utils = trpc.useUtils();

    // The card opening (150ms hover) is the strongest profile-visit intent
    // signal in the app — warm the profile route's RSC payload AND the Home
    // tab's queries (stream + video rows) so clicking through lands fully
    // populated, not shell-first. Covers every MiniProfile trigger (post
    // header names, avatars, comment rows). username/id may only be known
    // once the card query resolves, hence the effect instead of an
    // onOpenChange hook. Inputs must mirror home-hero/home-videos-row.
    const slug = username ?? card?.username;
    const targetUserId = userId ?? card?.id;
    React.useEffect(() => {
        if (!open) return;
        if (slug) router.prefetch(`/${slug}`);
        if (targetUserId) {
            utils.stream.getByUserId.prefetch({ userId: targetUserId });
            utils.content.getVideosByUser.prefetch({ userId: targetUserId, limit: 1 });
            utils.content.getVideosByUser.prefetch({ userId: targetUserId, limit: 12 });
        }
    }, [open, slug, targetUserId, router, utils]);
    const [optimisticFollowing, setOptimisticFollowing] = React.useState<boolean | null>(null);
    const settle = () => {
        utils.profile.card.invalidate();
        setOptimisticFollowing(null);
    };
    const follow = trpc.user.follow.useMutation({ onSuccess: settle, onError: () => setOptimisticFollowing(null) });
    const unfollow = trpc.user.unfollow.useMutation({ onSuccess: settle, onError: () => setOptimisticFollowing(null) });
    const isFollowing = optimisticFollowing ?? card?.isFollowing ?? false;

    if (!enabled) return <>{children}</>;

    const goToProfile = () => card?.username && router.push(`/${card.username}`);

    return (
        <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={120}>
            <HoverCardTrigger asChild>
                <div className={cn("cursor-pointer", triggerClassName ?? "w-full")}>{children}</div>
            </HoverCardTrigger>
            <HoverCardContent className="w-[320px] overflow-hidden rounded-3xl border-none bg-[#101011] shadow-none ring-1 ring-white/10">
                {isLoading || !card ? (
                    <div className="flex flex-col">
                        <div className="shimmer-skeleton h-20 w-full" />
                        <div className="flex flex-col gap-3 p-4">
                            <div className="shimmer-skeleton -mt-12 size-16 rounded-full ring-4 ring-[#101011]" />
                            <div className="shimmer-skeleton h-5 w-36 rounded-full" />
                            <div className="shimmer-skeleton h-4 w-48 rounded-full" />
                            <div className="shimmer-skeleton h-11 w-full rounded-full" />
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {/* Banner bleeding under the overlapping avatar */}
                        <div className="h-20 w-full bg-white/5">
                            {card.banner_url && (
                                <img src={card.banner_url} alt="" className="h-full w-full object-cover" />
                            )}
                        </div>

                        <div className="flex flex-col gap-2.5 p-4 pt-0">
                            <button onClick={goToProfile} className="-mt-8 size-16 shrink-0 cursor-pointer self-start overflow-hidden rounded-full bg-zinc-800 ring-4 ring-[#101011] transition-transform hover:scale-105">
                                <img src={card.avatar_url || "/avatar.png"} alt={card.name} className="h-full w-full object-cover" />
                            </button>

                            {/* Identity stack: name → username + badge strip on one line */}
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    <button onClick={goToProfile} className="cursor-pointer truncate text-lg font-bold text-white hover:underline">
                                        {card.name}
                                    </button>
                                    {card.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-4 shrink-0" />}
                                    {card.verifiedTier === "business" && <BusinessBadgeIcon className="size-4 shrink-0" />}
                                    {card.verifiedTier === "government" && <GovBadgeIcon className="size-4 shrink-0" />}
                                </div>
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 text-sm font-semibold text-zinc-500">@{card.username}</span>
                                    <LevelBadge xp={card.xp} />
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <BadgeStrip badges={card.badges} size="md" />
                                {card.pnl && pnlChip(card.pnl)}
                            </div>

                            {card.bio && (
                                <p className="line-clamp-2 text-sm leading-snug text-zinc-300">{card.bio}</p>
                            )}

                            <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500">
                                {card.createdAt && (
                                    <span className="flex items-center gap-1">
                                        <CalendarIcon width={13} height={13} />
                                        Joined {new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(card.createdAt))}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                                <span className="font-bold text-white">
                                    {card.followingCount} <span className="font-semibold text-zinc-500">Following</span>
                                </span>
                                <span className="font-bold text-white">
                                    {card.followersCount} <span className="font-semibold text-zinc-500">Followers</span>
                                </span>
                            </div>

                            {/* Community role chips (Discord roles-wall move) */}
                            {card.roles.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {card.roles.map((r) => (
                                        <span
                                            key={`${r.server}:${r.name}`}
                                            title={r.server}
                                            className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-zinc-200 ring-1 ring-white/10"
                                        >
                                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                                            {r.name}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {!card.isSelf && (
                                <div className="mt-1 flex items-center gap-2">
                                    <Button
                                        onClick={() => {
                                            const next = !isFollowing;
                                            setOptimisticFollowing(next);
                                            (next ? follow : unfollow).mutate({ followingId: card.id });
                                        }}
                                        className={cn(
                                            "h-11 flex-1 rounded-full text-base font-bold",
                                            isFollowing
                                                ? "border border-flexborder/50 bg-black/25 text-white hover:bg-white2/10"
                                                : "bg-twitter2/90 text-white2 hover:bg-twitter2",
                                        )}
                                    >
                                        {isFollowing ? "Following" : "Follow"}
                                    </Button>
                                    {card.subscribable && (
                                        <SubscribeButton creatorId={card.id} creatorName={card.name} />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </HoverCardContent>
        </HoverCard>
    );
}
