"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserLove01Icon } from "@hugeicons/core-free-icons";
import { UserType } from "@/db/schema/auth/user";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
// The SAME icons post-card uses for these three actions — BubbleIcon,
// RetweetIcon and the Heart pair — so a like on a post and a like on a video
// don't look like different features. HugeIcons has near-equivalents, but
// "near" is exactly the problem.
import { BubbleIcon, HeartFilledIcon, HeartIcon, RetweetIcon } from "@/components/icons";
import { MoreMenu } from "@/components/profile/profile-header-actions";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { GiftSubsButton } from "@/components/browse/gift-subs-button";

// The right-hand action row on the video and live pages.
//
// Left to right: comment, repost, heart, follow-or-subscribe, gift subs, dots —
// i.e. dots outermost, reading right to left as specced.
//
// It is NOT ProfileHeaderActions. That one is the profile page's full set (dots,
// gift premium, message, send, follow AND subscribe side by side) and it shows
// Follow and Subscribe as two separate buttons. Here they're ONE slot: a creator
// with no subscription tiers gets Follow/Following, a creator with tiers gets
// Subscribe. The underlying flows are still the shared components, so tier
// gating, the tier picker and the gift dialog all come from one place.

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

/** Repost toggle. content.repost is idempotent — it deletes the existing repost
 *  row when there is one — so one call covers both directions. */
function RepostButton({ postId, reposted }: { postId: string; reposted: boolean }) {
    const [optimistic, setOptimistic] = React.useState<boolean | null>(null);
    const on = optimistic ?? reposted;
    const repost = trpc.content.repost.useMutation({ onError: () => setOptimistic(null) });

    return (
        <button
            type="button"
            onClick={() => {
                setOptimistic(!on);
                repost.mutate({ postId });
            }}
            aria-pressed={on}
            aria-label={on ? "undo repost" : "repost"}
            className={cn(ICON_BTN, on && "text-lantern")}
        >
            <RetweetIcon className="size-5" />
        </button>
    );
}

export interface WatchPost {
    id: string;
    liked: boolean;
    onLikeToggle: () => void;
    reposted: boolean;
}

interface WatchActionsProps {
    user: UserType;
    /**
     * The post being watched. Comment, repost and heart all act on a post row,
     * and a live stream doesn't have one — so the live page passes nothing and
     * those three don't render, rather than sitting there dead.
     */
    post?: WatchPost;
}

export function WatchActions({ user, post }: WatchActionsProps) {
    const { data: session } = useAuthSession();
    const [showMore, setShowMore] = React.useState(false);

    // The same query SubscribeButton and GiftSubsButton gate themselves on, so
    // TanStack serves all three from one fetch.
    const { data: tiers } = trpc.subscription.getTiers.useQuery({ creatorId: user.id });
    const hasTiers = !!tiers?.length;
    const isOwner = session?.user?.id === user.id;

    return (
        <div className="flex items-center gap-2">
            {post && (
                <>
                    {/* Comments live further down the same page, so this scrolls
                        rather than navigates. */}
                    <button
                        type="button"
                        onClick={() =>
                            document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                        aria-label="jump to comments"
                        className={ICON_BTN}
                    >
                        <BubbleIcon className="size-5" />
                    </button>

                    <RepostButton postId={post.id} reposted={post.reposted} />

                    <button
                        type="button"
                        onClick={post.onLikeToggle}
                        aria-pressed={post.liked}
                        aria-label={post.liked ? "unlike" : "like"}
                        className={cn(ICON_BTN, post.liked && "text-pastelred")}
                    >
                        {/* Filled variant when liked, as post-card does — not a
                            fill-current override on the outline one. */}
                        {post.liked ? <HeartFilledIcon className="size-5" /> : <HeartIcon className="size-5" />}
                    </button>
                </>
            )}

            {!isOwner &&
                (hasTiers ? (
                    <SubscribeButton
                        creatorId={user.id}
                        creatorName={user.name}
                        className={PILL_BTN}
                        icon={<HugeiconsIcon icon={UserLove01Icon} className="size-5" strokeWidth={2} />}
                    />
                ) : (
                    <FollowButton userId={user.id} />
                ))}

            {/* Full "Gift Subs" button, not an icon — it self-gates, so it only
                appears for a creator who has subscriptions turned on, and at
                that point it's worth its own label. */}
            <GiftSubsButton creatorId={user.id} creatorName={user.name ?? ""} className={PILL_BTN} />

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
