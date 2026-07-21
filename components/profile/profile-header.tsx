"use client";

import { Edit2, Loader2, Zap, MoreHorizontal } from "lucide-react";
import { NoEntryIcon } from "@/components/icons";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { GiftSubsButton } from "@/components/browse/gift-subs-button";
import { GiftPremiumButton } from "@/components/browse/gift-premium-button";
import { MessageButton } from "@/components/browse/message-button";
import { UserType } from "@/db/schema/auth/user";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon, GlobeIcon, PinpointIcon, CalendarIcon, MaximizeIcon, MinimizeIcon, Link2Icon, VerticalDotsIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as React from "react";
import { EditProfileDialog } from "./edit-profile-dialog";
import { LevelBadge } from "./level-badge";
import { BadgeStrip } from "./badge-strip";
import { FollowersFollowingDialog } from "./followers-following-dialog";
import { TipModal } from "@/components/browse/tip-modal";
import { BlockButton, MuteButton } from "@/components/moderation/block-mute-buttons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { toast } from "sonner";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { getRealtimeClient } from "@/lib/supabase/realtime-client";

interface ProfileHeaderProps {
    user: UserType;
    isMinimized?: boolean;
    onToggleSize?: () => void;
}

function MoreMenu({ userId, username, open, onOpenChange, onClose }: {
    userId: string;
    username: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onClose: () => void;
}) {
    const utils = trpc.useUtils();
    const banUser = trpc.moderation.banUser.useMutation({
        onSuccess: () => { utils.moderation.isUserBannedByMe.invalidate({ userId }); onClose(); },
    });
    const unbanUser = trpc.moderation.unbanUser.useMutation({
        onSuccess: () => { utils.moderation.isUserBannedByMe.invalidate({ userId }); onClose(); },
    });
    const { data: banStatus } = trpc.moderation.isUserBannedByMe.useQuery({ userId });
    const isBanned = banStatus?.banned ?? false;

    const copyProfileLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/${username ?? userId}`);
        toast.success("Profile link copied");
    };

    const rowClass = "px-3 h-full w-full rounded-[14px] text-left font-semibold text-zinc-200 hover:bg-white/5";

    return (
        <GooDropdown
            open={open}
            onOpenChange={onOpenChange}
            align="end"
            width={236}
            gap={8}
            fill="#131316"
            panelRadius={18}
            itemHeight={44}
            triggerAriaLabel="More options"
            triggerClassName="flex size-11 items-center justify-center rounded-full border bg-black/25 border-flexborder/50 text-white2 hover:bg-white2/10 transition-colors"
            trigger={<VerticalDotsIcon className="size-6" />}
            items={[
                {
                    key: "copy",
                    onClick: copyProfileLink,
                    className: "gap-2.5 font-semibold text-zinc-200 cursor-pointer",
                    label: (
                        <>
                            <Link2Icon className="w-4 h-4 text-zinc-400" />
                            Copy profile link
                        </>
                    ),
                },
                { key: "sep-1", type: "separator" },
                {
                    key: "mute",
                    type: "custom",
                    label: <MuteButton userId={userId} username={username} className={cn(rowClass, "gap-2.5")} onDone={onClose} />,
                },
                {
                    key: "block",
                    type: "custom",
                    label: <BlockButton userId={userId} username={username} className={cn(rowClass, "gap-2.5")} onDone={onClose} />,
                },
                { key: "sep-2", type: "separator" },
                {
                    key: "ban",
                    onClick: () => isBanned ? unbanUser.mutate({ userId }) : banUser.mutate({ userId }),
                    closeOnSelect: false,
                    className: "gap-2.5 font-semibold text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer",
                    label: (
                        <>
                            {(banUser.isPending || unbanUser.isPending)
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <NoEntryIcon className="w-4 h-4" />}
                            {isBanned ? "Unban from channel" : "Ban from channel"}
                        </>
                    ),
                },
            ]}
        />
    );
}

const formatJoinedDate = (date: Date | null) => {
    if (!date) return "Joined Recently";
    try {
        const d = typeof date === "string" ? new Date(date) : date;
        return new Intl.DateTimeFormat("en-US", {
            month: "long",
            year: "numeric"
        }).format(d);
    } catch (e) {
        return "Joined Recently";
    }
};

export function ProfileHeader({ user, isMinimized, onToggleSize }: ProfileHeaderProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [followersDialog, setFollowersDialog] = React.useState<"followers" | "following" | null>(null);
    const [showTip, setShowTip] = React.useState(false);
    const [showMoreMenu, setShowMoreMenu] = React.useState(false);
    const { data: session, isPending: sessionPending } = useAuthSession();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => { setMounted(true); }, []);
    const isOwner = mounted && !sessionPending && session?.user?.id === user.id;
    const { data: counts, refetch: refetchCounts } = trpc.user.followCounts.useQuery({ userId: user.id });
    const { data: card } = trpc.profile.card.useQuery({ userId: user.id }, { enabled: !isMinimized });
    const { data: followData, refetch: refetchFollow } = trpc.user.isFollowing.useQuery({ followingId: user.id }, { enabled: !isOwner });
    const [optimisticFollowing, setOptimisticFollowing] = React.useState<boolean | null>(null);

    React.useEffect(() => {
        const client = getRealtimeClient();
        const channel = client
            .channel(`follows:${user.id}:${isMinimized ? 'compact' : 'full'}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'follows',
                filter: `followingId=eq.${user.id}`,
            }, () => {
                refetchCounts();
            })
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [user.id, refetchCounts]);
    const follow = trpc.user.follow.useMutation({
        onSuccess: () => { refetchCounts(); refetchFollow().then(() => setOptimisticFollowing(null)); },
        onError: () => setOptimisticFollowing(null),
    });
    const unfollow = trpc.user.unfollow.useMutation({
        onSuccess: () => { refetchCounts(); refetchFollow().then(() => setOptimisticFollowing(null)); },
        onError: () => setOptimisticFollowing(null),
    });

    const isFollowing = optimisticFollowing ?? followData?.isFollowing ?? false;

    const handleFollowToggle = () => {
        const next = !isFollowing;
        setOptimisticFollowing(next);
        if (!next) {
            unfollow.mutate({ followingId: user.id });
        } else {
            follow.mutate({ followingId: user.id });
        }
    };

    return (
        <div className="flex z-30 flex-col gap-1.5 max-w-2xl">
            <div className={cn("flex flex-row justify-start items-start", isMinimized ? "flex-row gap-4" : "gap-0.5")}>
                <div className={cn("flex items-center", isMinimized ? "flex-row gap-2" : "flex-row gap-4")}>
                    <h1 className={cn("font-black tracking-tighter text-white", isMinimized ? "text-xl" : "text-4xl")}>
                        {user.name}
                    </h1>
                    {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-6" />}
                    {user.verifiedTier === "business" && <BusinessBadgeIcon className="size-6" />}
                    {user.verifiedTier === "government" && <GovBadgeIcon className="size-6" />}

                    {/* Minimized (video/live creator rows) stays clean — LV bar +
                        badge strip are profile-page identity only (owner call). */}
                    {isMinimized && (
                        <span className="text-zinc-400 tracking-wide font-semibold text-sm ml-1">
                            @{user.username}
                        </span>
                    )}

                    <div className="flex items-center gap-2">
                        {!isOwner ? (
                            // Left to right (owner order, 2026-07-20): dots,
                            // gift premium (icon-only), message, send,
                            // follow, [subscribe/gift subs — no live tiers
                            // to test placement against yet], resize.
                            <>
                                <MoreMenu
                                    userId={user.id}
                                    username={user.username}
                                    open={showMoreMenu}
                                    onOpenChange={setShowMoreMenu}
                                    onClose={() => setShowMoreMenu(false)}
                                />
                                <GiftPremiumButton recipientId={user.id} recipientName={user.name} />
                                <MessageButton userId={user.id} />
                                {user.wallet_address && (
                                    <Button
                                        onClick={() => setShowTip(true)}
                                        className="h-11 px-5 rounded-full text-base bg-black/25 font-bold border border-flexborder/50 text-white2 hover:bg-white2/10"
                                        title="Send SOL"
                                    >
                                        Send
                                    </Button>
                                )}
                                <Button
                                    onClick={handleFollowToggle}
                                    className={cn(
                                        "h-11 rounded-full font-bold backdrop-blur-lg text-base px-5",
                                        isFollowing
                                            ? "bg-black/25 border border-flexborder/50 text-white hover:bg-white2/10"
                                            : "bg-white text-black hover:bg-zinc-100"
                                    )}
                                >
                                    {isFollowing ? "Following" : "Follow"}
                                </Button>
                                <SubscribeButton creatorId={user.id} creatorName={user.name} />
                                <GiftSubsButton creatorId={user.id} creatorName={user.name} />
                                {onToggleSize && (
                                    <Button
                                        onClick={onToggleSize}
                                        className="size-11 rounded-full border border-flexborder/50 bg-black/25 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center p-0"
                                        title={isMinimized ? "Maximum size" : "Minimum size"}
                                    >
                                        {isMinimized ? <MaximizeIcon className="size-6" /> : <MinimizeIcon className="size-6" />}
                                    </Button>
                                )}
                            </>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsEditing(true)}
                                    className="font-bold rounded-full bg-zinc-900/50 hover:bg-zinc-800 border border-flexborder/50 h-11 px-4"
                                >
                                    Edit profile
                                </Button>
                                {onToggleSize && (
                                    <Button
                                        variant="outline"
                                        onClick={onToggleSize}
                                        className="size-11 bg-zinc-900/50 hover:bg-zinc-800 rounded-full border border-flexborder/50 flex items-center justify-center p-0"
                                        title={isMinimized ? "Maximum size" : "Minimum size"}
                                    >
                                        {isMinimized ? <MaximizeIcon className="size-6" /> : <MinimizeIcon className="size-6" />}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {!isMinimized && (
                <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-zinc-400 tracking-wide font-semibold text-sm transition-all duration-300">
                        @{user.username}
                    </span>
                    <LevelBadge xp={user.xp} userId={user.id} />
                    {!card ? (
                        <div className="flex items-center gap-1.5">
                            <div className="shimmer-skeleton size-[22px] rounded-full" />
                            <div className="shimmer-skeleton size-[22px] rounded-full" />
                            <div className="shimmer-skeleton size-[22px] rounded-full" />
                        </div>
                    ) : (
                        <BadgeStrip badges={card.badges ?? []} />
                    )}
                </div>
            )}

            {user.bio && !isMinimized && (
                <p className="text-sm leading-relaxed text-white2 max-w-xl">
                    {user.bio}
                </p>
            )}

            {!isMinimized && (
                <div className="flex flex-wrap items-center gap-x-5 text-sm text-zinc-400 font-medium transition-all duration-300">
                    {user.location && (
                        <div className="flex items-center gap-1 tracking font-bold">
                            <PinpointIcon width={16} height={16} className="text-zinc-400" />
                            {user.location}
                        </div>
                    )}
                    
                    <div className="flex items-center gap-1 tracking font-bold">
                        <CalendarIcon width={16} height={16} className="text-zinc-400" />
                        Joined {formatJoinedDate(user.createdAt)}
                    </div>

                    {user.website && (
                        <a 
                            href={user.website.startsWith('http') ? user.website : `https://${user.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 font-bold cursor-pointer hover:text-white transition-colors group"
                        >
                            <Link2Icon className="w-4 h-4 text-zinc-400 group-hover:text-twitter2 transition-colors" />
                            {user.website.replace(/^https?:\/\//, "")}
                        </a>
                    )}
                </div>
            )}

            {!counts ? (
                <div className="flex items-center gap-5">
                    <div className="shimmer-skeleton h-4 w-24 rounded-full" />
                    <div className="shimmer-skeleton h-4 w-24 rounded-full" />
                </div>
            ) : (
                <div className="flex items-center gap-5 text-sm">
                    <button
                        onClick={() => setFollowersDialog("following")}
                        className="text-white font-bold hover:underline"
                    >
                        {counts.following} <span className="text-zinc-400 font-bold">Following</span>
                    </button>
                    <button
                        onClick={() => setFollowersDialog("followers")}
                        className="text-white font-bold hover:underline"
                    >
                        {counts.followers} <span className="text-zinc-400 font-bold">Followers</span>
                    </button>
                </div>
            )}

            {isOwner && (
                <EditProfileDialog
                    user={user}
                    open={isEditing}
                    onOpenChange={setIsEditing}
                />
            )}

            <FollowersFollowingDialog
                userId={user.id}
                username={user.username ?? undefined}
                initialTab={followersDialog ?? "followers"}
                open={followersDialog !== null}
                onOpenChange={(o) => { if (!o) setFollowersDialog(null); }}
                isOwnProfile={isOwner}
                followersCount={counts?.followers ?? 0}
                followingCount={counts?.following ?? 0}
            />

            {!isOwner && (
                <TipModal
                    open={showTip}
                    onOpenChange={setShowTip}
                    recipient={{
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        avatar_url: user.avatar_url,
                        wallet_address: user.wallet_address,
                    }}
                />
            )}
        </div>
    );
}
