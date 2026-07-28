"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FavouriteIcon, UserLove01Icon } from "@hugeicons/core-free-icons";
import { UserType } from "@/db/schema/auth/user";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { MoreMenu } from "@/components/profile/profile-header-actions";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { GiftSubsButton } from "@/components/browse/gift-subs-button";

// The right-hand action row on the video and live pages.
//
// Left to right: gift subs, follow-or-subscribe, heart, overflow menu — i.e.
// dots outermost, reading right to left as specced.
//
// It is NOT ProfileHeaderActions. That one is the profile page's full set (dots,
// gift premium, message, send, follow, AND subscribe side by side) and it shows
// Follow and Subscribe as two separate buttons. Here they're ONE button: a
// creator with no subscription tiers gets Follow/Following, a creator with tiers
// gets Subscribe. The underlying flows are the same components, so tier gating,
// the tier picker and the gift dialog all still come from one place.

const ICON_BTN =
    "flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-zinc-100 transition-colors hover:bg-white/15";
const PILL_BTN =
    "flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-5 text-md font-semibold text-zinc-100 transition-colors hover:bg-white/15";

/** Follow, with its optimistic flip. Rendered only when the creator has no
 *  tiers — with tiers, subscribing is the stronger action and takes the slot. */
function FollowButton({ userId }: { userId: string }) {
    const [optimistic, setOptimistic] = React.useState<boolean | null>(null);
    const utils = trpc.useUtils();

    const { data, refetch } = trpc.user.isFollowing.useQuery({ followingId: userId });
    const settle = () => {
        utils.user.followCounts.invalidate({ userId });
        refetch().then(() => setOptimistic(null));
    };
    const follow = trpc.user.follow.useMutation({ onSuccess: settle, onError: () => setOptimistic(null) });
    const unfollow = trpc.user.unfollow.useMutation({ onSuccess: settle, onError: () => setOptimistic(null) });

    const isFollowing = optimistic ?? data?.isFollowing ?? false;

    return (
        <button
            type="button"
            onClick={() => {
                const next = !isFollowing;
                setOptimistic(next);
                if (next) follow.mutate({ followingId: userId });
                else unfollow.mutate({ followingId: userId });
            }}
            className={PILL_BTN}
        >
            {isFollowing ? "Following" : "Follow"}
        </button>
    );
}

interface WatchActionsProps {
    user: UserType;
    /**
     * The heart. Owned by the page because only it knows what's being liked —
     * the video page has a post to like, and a live stream has no likeable row
     * yet, so it passes nothing and no heart renders rather than a dead one.
     */
    like?: { liked: boolean; onToggle: () => void };
}

export function WatchActions({ user, like }: WatchActionsProps) {
    const { data: session } = useAuthSession();
    const [showMore, setShowMore] = React.useState(false);

    // Same query SubscribeButton and GiftSubsButton gate themselves on, so
    // TanStack serves all three from one fetch.
    const { data: tiers } = trpc.subscription.getTiers.useQuery({ creatorId: user.id });
    const hasTiers = !!tiers?.length;
    const isOwner = session?.user?.id === user.id;

    return (
        <div className="flex items-center gap-2">
            <GiftSubsButton creatorId={user.id} creatorName={user.name ?? ""} className={ICON_BTN} iconOnly />

            {!isOwner && (
                hasTiers ? (
                    <SubscribeButton
                        creatorId={user.id}
                        creatorName={user.name}
                        className={PILL_BTN}
                        icon={<HugeiconsIcon icon={UserLove01Icon} className="size-5" strokeWidth={2} />}
                    />
                ) : (
                    <FollowButton userId={user.id} />
                )
            )}

            {like && (
                <button
                    type="button"
                    onClick={like.onToggle}
                    aria-pressed={like.liked}
                    aria-label={like.liked ? "unlike" : "like"}
                    className={cn(ICON_BTN, like.liked && "text-pastelred [&_path]:fill-current")}
                >
                    <HugeiconsIcon icon={FavouriteIcon} className="size-5" strokeWidth={2} />
                </button>
            )}

            <MoreMenu
                userId={user.id}
                username={user.username}
                open={showMore}
                onOpenChange={setShowMore}
                onClose={() => setShowMore(false)}
                triggerClassName={ICON_BTN}
            />
        </div>
    );
}
