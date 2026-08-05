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
import dynamic from "next/dynamic";
import { HugeiconsIcon } from "@hugeicons/react";
import { GiftIcon, VolumeMute02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

// ssr:false, not a bare import(): the gift dialog pulls the wallet stack
// (useConnection, useWallet, signing), and a lazy import alone still bundles it
// into every route a mini profile can appear on — which is all of them. Only
// ssr:false actually keeps it out until someone opens it.
const GiftSubscriptionDialog = dynamic(
    () => import("@/components/browse/gift-subscription-dialog").then((m) => m.GiftSubscriptionDialog),
    { ssr: false },
);

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

export function MiniProfile({ userId, username, children, triggerClassName, inline }: {
    userId?: string | null;
    username?: string | null;
    children: React.ReactNode;
    /** Layout class for the trigger wrapper — rows in tight flex layouts pass "min-w-0". */
    triggerClassName?: string;
    /**
     * Wrap in a <span> instead of a <div>.
     *
     * Required anywhere the trigger sits inside a paragraph — a chat line is one
     * <p>, and a <div> inside <p> is invalid HTML that the parser closes the
     * paragraph to escape. The trigger then ends up as a SIBLING of the text it
     * was meant to wrap, which is why hovering a chat username did nothing while
     * clicking still worked.
     */
    inline?: boolean;
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
    const [giftOpen, setGiftOpen] = React.useState(false);
    const [optimisticFollowing, setOptimisticFollowing] = React.useState<boolean | null>(null);
    const settle = () => {
        utils.profile.card.invalidate();
        setOptimisticFollowing(null);
    };
    const follow = trpc.user.follow.useMutation({ onSuccess: settle, onError: () => setOptimisticFollowing(null) });
    const unfollow = trpc.user.unfollow.useMutation({ onSuccess: settle, onError: () => setOptimisticFollowing(null) });
    const isFollowing = optimisticFollowing ?? card?.isFollowing ?? false;

    // Mute state is its own query rather than part of profile.card: the card is
    // server-cached for five minutes and shared by every viewer, while this is
    // per-viewer and has to flip the instant they act on it.
    const targetId = userId ?? card?.id;
    const { data: muted } = trpc.moderation.isMuted.useQuery(
        { userId: targetId ?? "" },
        { enabled: !!targetId && open },
    );
    const settleMute = () => utils.moderation.isMuted.invalidate({ userId: targetId ?? "" });
    const mute = trpc.moderation.mute.useMutation({
        onSuccess: () => { settleMute(); toast.success("Muted"); },
        onError: (e) => toast.error(e.message),
    });
    const unmute = trpc.moderation.unmute.useMutation({
        onSuccess: () => { settleMute(); toast.success("Unmuted"); },
        onError: (e) => toast.error(e.message),
    });

    if (!enabled) return <>{children}</>;

    const goToProfile = () => card?.username && router.push(`/${card.username}`);

    return (
        <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={120}>
            <HoverCardTrigger asChild>
                {inline ? (
                    <span className={cn("cursor-pointer", triggerClassName)}>{children}</span>
                ) : (
                    <div className={cn("cursor-pointer", triggerClassName ?? "w-full")}>{children}</div>
                )}
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

                            {!card.isSelf && (
                                // Second row, quieter than the first: following
                                // and subscribing are what the card is FOR, while
                                // these two are things you do about one person.
                                <div className="flex items-center gap-2">
                                    {card.subscribable && (
                                        // "Gift subs", not "Gift a sub". This is
                                        // community gifting: it buys subs to
                                        // THEIR channel for random eligible
                                        // followers, and the API takes a quantity
                                        // rather than a recipient. "Gift a sub"
                                        // reads as gifting this person one, which
                                        // is a thing the app can't do.
                                        <Button
                                            variant="outline"
                                            onClick={() => setGiftOpen(true)}
                                            title={`Gift subs to ${card.name}'s channel — they go to random followers who aren't subscribed`}
                                            className="h-11 flex-1 rounded-full text-sm font-bold"
                                        >
                                            <HugeiconsIcon icon={GiftIcon} className="size-4" strokeWidth={2} />
                                            Gift subs
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            muted?.muted
                                                ? unmute.mutate({ userId: card.id })
                                                : mute.mutate({ userId: card.id })
                                        }
                                        disabled={mute.isPending || unmute.isPending}
                                        className={cn(
                                            "h-11 rounded-full text-sm font-bold",
                                            card.subscribable ? "flex-1" : "w-full",
                                        )}
                                    >
                                        <HugeiconsIcon icon={VolumeMute02Icon} className="size-4" strokeWidth={2} />
                                        {muted?.muted ? "Unmute" : "Mute"}
                                    </Button>
                                </div>
                            )}

                            {giftOpen && (
                                <GiftSubscriptionDialog
                                    creatorId={card.id}
                                    creatorName={card.name}
                                    open={giftOpen}
                                    onOpenChange={setGiftOpen}
                                />
                            )}
                        </div>
                    </div>
                )}
            </HoverCardContent>
        </HoverCard>
    );
}
