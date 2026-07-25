"use client";

import { Edit2, Loader2, Zap, MoreHorizontal } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HammerIcon } from "@hugeicons/core-free-icons";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { GiftSubsButton } from "@/components/browse/gift-subs-button";
import { GiftPremiumButton } from "@/components/browse/gift-premium-button";
import { MessageButton } from "@/components/browse/message-button";
import { UserType } from "@/db/schema/auth/user";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon, MaximizeIcon, MinimizeIcon, Link2Icon, VerticalDotsIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as React from "react";
import { EditProfileDialog } from "./edit-profile-dialog";
import { LevelBadge } from "./level-badge";
import { BadgeStrip } from "./badge-strip";
import { FollowersFollowingDialog } from "./followers-following-dialog";
import { TipModal } from "@/components/browse/tip-modal";
import { BlockButton, MuteButton } from "@/components/moderation/block-mute-buttons";
import { GooDropdown, gooMenuItem } from "@/components/ui/goo-dropdown";
import { toast } from "sonner";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { getRealtimeClient } from "@/lib/supabase/realtime-client";

interface ProfileHeaderProps {
    user: UserType;
    isMinimized?: boolean;
    onToggleSize?: () => void;
    /** Server-fetched seed — kills the counts-only second skeleton phase on the
        profile page. Video/stream headers omit it and keep the shimmer. */
    initialFollowCounts?: { followers: number; following: number };
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

    // Matches the standard menu row (goo-dropdown's base): same text size and
    // weight as the built rows, and [&_svg]:size-[18px] overrides the icon
    // sizes MuteButton/BlockButton hardcode, so every row lines up. No
    // rounded-* — the component squircles rows.
    const rowClass = "gap-3 px-4 h-full w-full text-left text-base font-bold text-zinc-200 hover:bg-white/5 hover:text-white [&_svg]:size-[18px]";

    return (
        <GooDropdown
            open={open}
            onOpenChange={onOpenChange}
            align="start"
            width={236}
            gap={8}
            triggerAriaLabel="More options"
            triggerClassName="flex size-11 items-center justify-center rounded-full border bg-soft-gray/5 border-baseborder/5 text-white2 hover:bg-soft-gray/15 transition-colors"
            trigger={<VerticalDotsIcon className="size-5" />}
            items={[
                gooMenuItem({
                    key: "copy",
                    onClick: copyProfileLink,
                    icon: <Link2Icon />,
                    label: "Copy profile link",
                }),
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
                gooMenuItem({
                    key: "ban",
                    onClick: () => isBanned ? unbanUser.mutate({ userId }) : banUser.mutate({ userId }),
                    closeOnSelect: false,
                    variant: "danger",
                    icon: (banUser.isPending || unbanUser.isPending)
                        ? <Loader2 className="animate-spin" />
                        : <HugeiconsIcon icon={HammerIcon} />,
                    label: isBanned ? "Unban from channel" : "Ban from channel",
                }),
            ]}
        />
    );
}

export function ProfileHeader({ user, isMinimized, onToggleSize, initialFollowCounts }: ProfileHeaderProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [followersDialog, setFollowersDialog] = React.useState<"followers" | "following" | null>(null);
    const [showTip, setShowTip] = React.useState(false);
    const [showMoreMenu, setShowMoreMenu] = React.useState(false);
    const { data: session, isPending: sessionPending } = useAuthSession();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => { setMounted(true); }, []);
    const isOwner = mounted && !sessionPending && session?.user?.id === user.id;
    const { data: counts, refetch: refetchCounts } = trpc.user.followCounts.useQuery(
        { userId: user.id },
        { initialData: initialFollowCounts },
    );
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
        <div className="flex z-30 flex-col gap-1.5 flex-1 min-w-0">
            <div className="flex flex-row justify-between items-center w-full gap-4">
                <div className={cn("flex items-center min-w-0", isMinimized ? "flex-row gap-2" : "flex-row gap-2")}>
                    <h1 className={cn("font-semibold leading-none tracking-tighter text-white", isMinimized ? "text-xl" : "text-2xl")}>
                        {user.name}
                    </h1>
                    {user.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-5" />}
                    {user.verifiedTier === "business" && <BusinessBadgeIcon className="size-5" />}
                    {user.verifiedTier === "government" && <GovBadgeIcon className="size-5" />}

                    {/* Minimized (video/live creator rows) stays clean — LV bar +
                        badge strip are profile-page identity only (owner call). */}
                    {isMinimized && (
                        <span className="text-zinc-400 tracking-wide font-semibold text-sm">
                            @{user.username}
                        </span>
                    )}
                </div>

                {/* Action buttons — pushed to the right edge of the center column. */}
                <div className="flex items-center gap-2 shrink-0">
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
                                <GiftPremiumButton
                                    recipientId={user.id}
                                    recipientName={user.name}
                                    className="flex size-11 items-center justify-center rounded-full border border-baseborder/5 bg-soft-gray/5 text-white2 transition-colors hover:bg-soft-gray/15"
                                />
                                <MessageButton
                                    userId={user.id}
                                    className="flex size-11 items-center justify-center rounded-full border border-baseborder/5 bg-soft-gray/5 text-white2 transition-colors hover:bg-soft-gray/15 disabled:opacity-50"
                                />
                                {user.wallet_address && (
                                    <Button
                                        onClick={() => setShowTip(true)}
                                        className="h-11 px-5 rounded-full text-base bg-soft-gray/5 font-bold border border-baseborder/5 text-white2 hover:bg-soft-gray/15"
                                        title="Send SOL"
                                    >
                                        Send
                                    </Button>
                                )}
                                <Button
                                    onClick={handleFollowToggle}
                                    className="h-11 rounded-full font-bold backdrop-blur-lg text-base px-5 bg-soft-gray/5 border border-baseborder/5 text-white hover:bg-soft-gray/15"
                                >
                                    {isFollowing ? "Following" : "Follow"}
                                </Button>
                                <SubscribeButton creatorId={user.id} creatorName={user.name} />
                                <GiftSubsButton
                                    creatorId={user.id}
                                    creatorName={user.name}
                                    className="flex h-11 items-center gap-1.5 rounded-full border border-baseborder/5 bg-soft-gray/5 px-4 text-base font-bold text-white2 transition-colors hover:bg-soft-gray/15"
                                />
                                {onToggleSize && (
                                    <Button
                                        onClick={onToggleSize}
                                        className="size-11 rounded-full border border-baseborder/5 bg-soft-gray/5 hover:bg-soft-gray/15 text-zinc-400 hover:text-zinc-100 flex items-center justify-center p-0"
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
                                    className="font-bold rounded-full bg-soft-gray/5 hover:bg-soft-gray/15 border border-baseborder/5 h-11 px-4"
                                >
                                    Edit profile
                                </Button>
                                {onToggleSize && (
                                    <Button
                                        variant="outline"
                                        onClick={onToggleSize}
                                        className="size-11 bg-soft-gray/5 hover:bg-soft-gray/15 rounded-full border border-baseborder/5 flex items-center justify-center p-0"
                                        title={isMinimized ? "Maximum size" : "Minimum size"}
                                    >
                                        {isMinimized ? <MaximizeIcon className="size-6" /> : <MinimizeIcon className="size-6" />}
                                    </Button>
                                )}
                            </div>
                        )}
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

            {/* bio + details (location / joined / website) moved to the About
                tab's AboutCard (2026-07-24) */}

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
