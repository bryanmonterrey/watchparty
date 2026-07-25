"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HammerIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { UserType } from "@/db/schema/auth/user";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { MaximizeIcon, MinimizeIcon, Link2Icon, VerticalDotsIcon } from "@/components/icons";
import { GooDropdown, gooMenuItem } from "@/components/ui/goo-dropdown";
import { BlockButton, MuteButton } from "@/components/moderation/block-mute-buttons";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { GiftSubsButton } from "@/components/browse/gift-subs-button";
import { GiftPremiumButton } from "@/components/browse/gift-premium-button";
import { MessageButton } from "@/components/browse/message-button";
import { TipModal } from "@/components/browse/tip-modal";
import { EditProfileDialog } from "./edit-profile-dialog";

// Shared header button skin: soft-gray fill, hairline border, pill. Icon
// buttons are size-11; pill buttons are h-11.
const iconBtnClass =
    "flex size-11 items-center justify-center rounded-full border border-baseborder/5 bg-soft-gray-5 text-white2 transition-colors hover:bg-soft-gray-15";

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
            triggerClassName={iconBtnClass}
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

interface ProfileHeaderActionsProps {
    user: UserType;
    /** Computed by ProfileHeader from the session (mount-gated to avoid a hydration flash). */
    isOwner: boolean;
    isMinimized?: boolean;
    onToggleSize?: () => void;
}

/** The action cluster on the right of the profile header — follow/subscribe/gift/
    message/tip/edit + the more menu, with their own state and modals. Extracted
    from ProfileHeader so the header itself is just identity + stats. */
export function ProfileHeaderActions({ user, isOwner, isMinimized, onToggleSize }: ProfileHeaderActionsProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [showTip, setShowTip] = React.useState(false);
    const [showMoreMenu, setShowMoreMenu] = React.useState(false);
    const [optimisticFollowing, setOptimisticFollowing] = React.useState<boolean | null>(null);

    const utils = trpc.useUtils();
    const { data: followData, refetch: refetchFollow } = trpc.user.isFollowing.useQuery(
        { followingId: user.id },
        { enabled: !isOwner },
    );

    // Counts live in ProfileHeader; invalidate its query so it refetches after a
    // follow toggle (the realtime sub also catches it, this is just immediacy).
    const invalidateCounts = () => utils.user.followCounts.invalidate({ userId: user.id });
    const follow = trpc.user.follow.useMutation({
        onSuccess: () => { invalidateCounts(); refetchFollow().then(() => setOptimisticFollowing(null)); },
        onError: () => setOptimisticFollowing(null),
    });
    const unfollow = trpc.user.unfollow.useMutation({
        onSuccess: () => { invalidateCounts(); refetchFollow().then(() => setOptimisticFollowing(null)); },
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
        <div className="flex items-center gap-2 shrink-0">
            {!isOwner ? (
                // Left to right (owner order, 2026-07-20): dots, gift premium
                // (icon-only), message, send, follow, [subscribe/gift subs — no
                // live tiers to test placement against yet], resize.
                <>
                    <MoreMenu
                        userId={user.id}
                        username={user.username}
                        open={showMoreMenu}
                        onOpenChange={setShowMoreMenu}
                        onClose={() => setShowMoreMenu(false)}
                    />
                    <GiftPremiumButton recipientId={user.id} recipientName={user.name} className={iconBtnClass} />
                    <MessageButton userId={user.id} className={cn(iconBtnClass, "disabled:opacity-50")} />
                    {user.wallet_address && (
                        <Button
                            onClick={() => setShowTip(true)}
                            className="h-11 px-5 rounded-full text-base bg-soft-gray-5 font-bold border border-baseborder/5 text-white2 hover:bg-soft-gray-15"
                            title="Send SOL"
                        >
                            Send
                        </Button>
                    )}
                    <Button
                        onClick={handleFollowToggle}
                        className="h-11 rounded-full font-bold backdrop-blur-lg text-base px-5 bg-soft-gray-5 border border-baseborder/5 text-white hover:bg-soft-gray-15"
                    >
                        {isFollowing ? "Following" : "Follow"}
                    </Button>
                    <SubscribeButton creatorId={user.id} creatorName={user.name} />
                    <GiftSubsButton
                        creatorId={user.id}
                        creatorName={user.name}
                        className="flex h-11 items-center gap-1.5 rounded-full border border-baseborder/5 bg-soft-gray-5 px-4 text-base font-bold text-white2 transition-colors hover:bg-soft-gray-15"
                    />
                    {onToggleSize && (
                        <Button
                            onClick={onToggleSize}
                            className="size-11 rounded-full border border-baseborder/5 bg-soft-gray-5 hover:bg-soft-gray-15 text-zinc-400 hover:text-zinc-100 flex items-center justify-center p-0"
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
                        className="font-bold rounded-full bg-soft-gray-5 hover:bg-soft-gray-15 border border-baseborder/5 h-11 px-4"
                    >
                        Edit profile
                    </Button>
                    {onToggleSize && (
                        <Button
                            variant="outline"
                            onClick={onToggleSize}
                            className="size-11 bg-soft-gray-5 hover:bg-soft-gray-15 rounded-full border border-baseborder/5 flex items-center justify-center p-0"
                            title={isMinimized ? "Maximum size" : "Minimum size"}
                        >
                            {isMinimized ? <MaximizeIcon className="size-6" /> : <MinimizeIcon className="size-6" />}
                        </Button>
                    )}
                </div>
            )}

            {isOwner && (
                <EditProfileDialog user={user} open={isEditing} onOpenChange={setIsEditing} />
            )}

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
