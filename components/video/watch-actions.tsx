"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserLove01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
// The SAME icons post-card uses — RetweetIcon and the Heart pair — so a like on
// a post and a like on a video don't look like different features. HugeIcons has
// near-equivalents, but "near" is exactly the problem.
import { BookmarkFilledIcon, BookmarkIcon, HeartFilledIcon, HeartIcon, Link2Icon, RetweetIcon } from "@/components/icons";
import { toast } from "sonner";
import { gooMenuItem } from "@/components/ui/goo-dropdown";
import { MoreMenu } from "@/components/profile/profile-header-actions";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { GiftSubsButton } from "@/components/browse/gift-subs-button";

// The right-hand action row on the video and live pages.
//
// Left to right: repost, heart, follow-or-subscribe, gift subs, dots — i.e. dots
// outermost, reading right to left as specced. The VIDEO page reorders it with
// followFirst and drops gift subs (see those props). No comment icon: that action is
// the post card's, and this page already has the comment section on it. Share
// and Save are rows in the dots menu, not buttons.
//
// It is NOT ProfileHeaderActions. That one is the profile page's full set (dots,
// gift premium, message, send, follow AND subscribe side by side). Here the text
// button is ONE thing: Follow when the creator has no tiers, Subscribe when they
// do — and in the Subscribe case the follow mark becomes its own icon button to
// its left, since following can't just lose its control. The underlying flows are
// still the shared components, so tier gating, the tier picker and the gift
// dialog all come from one place.

const ICON_BTN =
    "flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-zinc-100 transition-colors hover:bg-white/15";
const PILL_BTN =
    "flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-5 text-md font-semibold text-zinc-100 transition-colors hover:bg-white/15";

/** The follow toggle's state + action, shared by both of its shapes below. */
function useFollow(userId: string) {
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
    const toggle = () => {
        const next = !isFollowing;
        setOptimistic(next);
        if (next) follow.mutate({ followingId: userId });
        else unfollow.mutate({ followingId: userId });
    };
    return { isFollowing, toggle };
}

/** Text shape — the creator has NO subscription tiers, so following is the only
 *  relationship on offer and it gets the whole button. No icon here: the mark is
 *  what distinguishes the icon-button shape below. */
function FollowButton({ userId }: { userId: string }) {
    const { isFollowing, toggle } = useFollow(userId);
    return (
        <button type="button" onClick={toggle} className={PILL_BTN}>
            {isFollowing ? "Following" : "Follow"}
        </button>
    );
}

/** Icon shape — the creator HAS tiers, so Subscribe takes the text button and
 *  following needs its own control rather than losing its slot. Filled + accented
 *  once you follow, so the state reads without a label. */
function FollowIconButton({ userId }: { userId: string }) {
    const { isFollowing, toggle } = useFollow(userId);
    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={isFollowing}
            aria-label={isFollowing ? "unfollow" : "follow"}
            title={isFollowing ? "Following" : "Follow"}
            className={cn(
                ICON_BTN,
                isFollowing && "text-bleu [&_path]:fill-current",
            )}
        >
            <HugeiconsIcon icon={UserLove01Icon} className="size-5" strokeWidth={2} />
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
    /** Seeded from the server so the Save row opens in the right state. */
    bookmarked?: boolean;
}

interface WatchActionsProps {
    /** Only what the row actually needs — narrowing this to three fields is what
     *  lets home pass a feed row instead of casting one to UserType. */
    user: { id: string; name: string | null; username: string | null };
    /** Replaces the default heart. Home passes its animated LikeButton so the
     *  burst survives; the watch pages take the plain icon button. */
    likeButton?: React.ReactNode;
    /**
     * The post being watched. Comment, repost and heart all act on a post row,
     * and a live stream doesn't have one — so the live page passes nothing and
     * those three don't render, rather than sitting there dead.
     */
    post?: WatchPost;
    /** Follow/Subscribe leads the row instead of sitting after repost + heart —
     *  what the video page wants. */
    followFirst?: boolean;
    /** Gift Subs is off on the video page: gifting is a channel act, and the
     *  video page's row is about the video. */
    giftSubs?: boolean;
}

export function WatchActions({ user, post, likeButton, followFirst, giftSubs = true }: WatchActionsProps) {
    const { data: session } = useAuthSession();
    const [showMore, setShowMore] = React.useState(false);

    // The same query SubscribeButton and GiftSubsButton gate themselves on, so
    // TanStack serves all three from one fetch.
    const { data: tiers } = trpc.subscription.getTiers.useQuery({ creatorId: user.id });
    const hasTiers = !!tiers?.length;
    const isOwner = session?.user?.id === user.id;

    const [saved, setSaved] = React.useState<boolean | null>(null);
    const toggleBookmark = trpc.content.toggleBookmark.useMutation({
        onError: () => setSaved(null),
    });
    const isSaved = saved ?? post?.bookmarked ?? false;

    // Share and Save live in the overflow menu rather than as two more buttons:
    // the row already carries five, and neither is a primary action.
    const menuExtras = post
        ? [
            gooMenuItem({
                key: "share",
                onClick: () => {
                    // The VIDEO's link, never the page's. This copied
                    // window.location.href, which on /home (where the hero
                    // plays the video in place) was the home page.
                    void navigator.clipboard.writeText(`${window.location.origin}/video/${post.id}`);
                    toast.success("Link copied");
                },
                icon: <Link2Icon />,
                label: "Share",
            }),
            gooMenuItem({
                key: "save",
                onClick: () => {
                    setSaved(!isSaved);
                    toggleBookmark.mutate({ postId: post.id, contentType: "video" });
                },
                icon: isSaved ? <BookmarkFilledIcon /> : <BookmarkIcon />,
                label: isSaved ? "Saved" : "Save",
            }),
            { key: "sep-extras", type: "separator" as const },
        ]
        : undefined;

    // One text button either way — Follow when there's nothing to subscribe to,
    // Subscribe when there is — with the follow mark breaking out into its own
    // icon button to its LEFT in the subscribe case, so following is still
    // reachable when it no longer owns the label.
    const followSlot = !isOwner
        ? hasTiers
            ? (
                <>
                    <FollowIconButton userId={user.id} />
                    <SubscribeButton
                        creatorId={user.id}
                        creatorName={user.name ?? ""}
                        className={PILL_BTN}
                        icon={null}
                    />
                </>
            )
            : <FollowButton userId={user.id} />
        : null;

    return (
        <div className="flex items-center gap-2">
            {followFirst && followSlot}

            {post && (
                <>
                    {/* No comment button. Commenting is a post-card action — the
                        icon belongs there, and the comment section is already
                        further down this page, so a second entry point in the
                        header would be a shortcut to something in view. Repost
                        and heart stay here. */}
                    <RepostButton postId={post.id} reposted={post.reposted} />

                    {likeButton ?? (
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
                    )}
                </>
            )}


            {!followFirst && followSlot}

            {/* Full "Gift Subs" button, not an icon — it self-gates, so it only
                appears for a creator who has subscriptions turned on, and at
                that point it's worth its own label. */}
            {giftSubs && <GiftSubsButton creatorId={user.id} creatorName={user.name ?? ""} className={PILL_BTN} />}

            <MoreMenu
                userId={user.id}
                username={user.username}
                open={showMore}
                onOpenChange={setShowMore}
                onClose={() => setShowMore(false)}
                triggerClassName={ICON_BTN}
                extraItems={menuExtras}
            />
        </div>
    );
}
