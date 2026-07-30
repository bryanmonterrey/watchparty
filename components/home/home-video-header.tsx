"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { FavouriteIcon } from "@hugeicons/core-free-icons";
import { cn, compactCount } from "@/lib/utils";
import { useBurst } from "@/hooks/use-burst";
import { trpc } from "@/lib/trpc/client";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { TokenAction } from "@/components/tokens/token-row";
import { ViewsStat } from "@/components/ui/views-stat";
import { WatchActions } from "@/components/video/watch-actions";
import { formatRelativeTime } from "@/lib/date-utils";
import type { HomeFeedVideo } from "./home-feed-context";

// Metadata header for whatever the hero is playing — the video's identity,
// written out rather than overlaid on the frame. The hero itself runs with
// chrome={false} precisely so this can own it: text over video is hard to read
// and covers the picture, and none of this is worth obscuring the frame for.
//
// Mount it KEYED ON THE VIDEO ID. The like state below is seeded from props and
// then owned locally (so a tap doesn't wait for a refetch), which is only
// correct if switching videos remounts the component.

/** 1.2K / 48.3K / 2.1M — view and like counts get large. */
function VerifiedBadge({ tier }: { tier: HomeFeedVideo["user"]["verifiedTier"] }) {
    if (tier === "verified") return <VerifiedBadgeIcon className="size-4 shrink-0" />;
    if (tier === "business") return <BusinessBadgeIcon className="size-4 shrink-0" />;
    if (tier === "government") return <GovBadgeIcon className="size-4 shrink-0" />;
    return null;
}

function LikeButton({ video }: { video: HomeFeedVideo }) {
    // Seeded from the feed (getVideoFeed resolves isLiked per viewer), then
    // owned here so the tap is instant.
    const [liked, setLiked] = useState(!!video.isLiked);
    const [count, setCount] = useState(video.likes ?? 0);
    // The burst moved to hooks/use-burst so the trending star can fire the same
    // one — it recolours it by overriding --like-color on its own button.
    const { bursting, particles, fire } = useBurst();

    const toggle = trpc.content.toggleLike.useMutation({
        onError: () => {
            // Roll the optimistic flip back rather than leaving the UI lying.
            setLiked((prev) => !prev);
            setCount((c) => (liked ? c + 1 : Math.max(0, c - 1)));
        },
    });

    const onClick = () => {
        const next = !liked;
        setLiked(next);
        setCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
        toggle.mutate({ postId: video.id });

        // The celebration only plays on the way IN — unliking just reverses the
        // fill, per the snippet.
        if (next) fire();
    };

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={liked}
            aria-label={liked ? "unlike" : "like"}
            // t-like + data-liked are the snippet's hooks; `relative` is what
            // the absolutely-positioned particle layer anchors to.
            className={cn(
                "t-like relative flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors",
                bursting && "is-bursting",
                liked ? "bg-pastelred/15 text-pastelred" : "bg-white/[0.06] text-zinc-300 hover:text-white",
            )}
            data-liked={liked}
        >
            {/* The pop scale rides this wrapper, never the <svg> — transforming
                an inline SVG makes Chromium rasterise it at 1× and it goes
                fuzzy on hi-DPI. The fill is the snippet's job now (it animates
                the path), so no fill-current class here. */}
            <span className="t-like-icon flex">
                <HugeiconsIcon icon={FavouriteIcon} className="t-like-heart size-4.5" strokeWidth={2} />
            </span>

            <span className="t-like-particles" aria-hidden>
                {particles.map((style, i) => (
                    <i key={i} style={style} />
                ))}
            </span>

            {count > 0 && <span className="tabular-nums">{compactCount(count)}</span>}
        </button>
    );
}

export function HomeVideoHeader({ video, className, action }: {
    video: HomeFeedVideo;
    className?: string;
    /** Last item on the right column's second row — home's collapse chevron.
     *  Passed in rather than owned here: the toggle it drives is the centre
     *  column's state, and this header renders inside that column. */
    action?: React.ReactNode;
}) {
    const username = video.user.username;
    // The mint once live, else the token row id — /coin/<mint> resolves both.
    const tokenSlug = video.tokenAddress ?? video.tokenId;
    const hasToken = !!tokenSlug && !!video.ticker;
    // The token row's image, with the video's own thumbnail as a backstop.
    // Token creation already writes the thumbnail into tokens.imageUrl when a
    // creator supplies no art, so the fallback only covers rows that predate
    // that — but it costs nothing and the pill is never blank.
    const tokenImage = video.tokenImageUrl ?? video.thumbnailUrl;

    return (
        <div className={cn("flex min-w-0 py-2.5 items-start gap-3", className)}>
            <Link href={username ? `/${username}` : "#"} className="shrink-0" aria-label={username ?? "creator"}>
                {/* Always the shared placeholder, never a letter fallback. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={video.user.avatar_url || "/avatar.png"}
                    alt=""
                    className="size-11 rounded-full bg-zinc-800 object-cover"
                />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col gap-0">
                <h2 className="line-clamp-1 text-[17px] font-bold leading-tight tracking-tight text-white">
                    {video.title}
                </h2>

                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[16px] text-zinc-500">
                    {username && (
                        <Link
                            href={`/${username}`}
                            className="flex min-w-0 items-center gap-1 font-semibold text-zinc-300 transition-colors hover:text-white"
                        >
                            <span className="truncate">@{username}</span>
                            <VerifiedBadge tier={video.user.verifiedTier} />
                        </Link>
                    )}
                </div>

            </div>

            {/* Third column, right end: the like button on one row, the count,
                date and collapse control on the next. Its own column, NOT the
                right half of the identity rows — those keep their own spacing
                and wrap on their own terms, and nothing here has to line up
                with a title that might run to two lines. */}
            <div className="flex shrink-0 flex-col items-end gap-3.5">
                {/* Same row as the video and live headers, so the three read as
                    one component — but home keeps its OWN heart: LikeButton
                    carries the burst animation and a count, and swapping it for
                    the plain icon button would throw both away. */}
                <WatchActions
                    user={{ id: video.user.id ?? "", name: video.user.name ?? null, username: video.user.username }}
                    // onLikeToggle is unused here — likeButton replaces the heart
                    // and LikeButton owns its own optimistic toggle.
                    post={{ id: video.id, liked: !!video.isLiked, onLikeToggle: () => {}, reposted: !!video.isReposted }}
                    likeButton={<LikeButton video={video} />}
                />

                <div className="flex items-center gap-x-1.5 text-[16px] font-medium text-zinc-500">
                    {video.isLive ? (
                        <span className="flex items-center gap-1.5 font-bold text-pastelred">
                            <span className="size-1.5 animate-pulse rounded-full bg-pastelred" />
                            live
                        </span>
                    ) : (
                        <ViewsStat views={video.views} />
                    )}
                    {/* The coin's action sits with the stats, not on a line of
                        its own — the ticker pill is gone from this header, so
                        Launch/Buy is all that's left of the coin row. */}
                    {hasToken && (
                        <>
                            <span aria-hidden>·</span>
                            <TokenAction
                                postId={video.id}
                                token={{
                                    id: video.tokenId ?? "",
                                    tokenAddress: video.tokenAddress,
                                    ticker: video.ticker ?? null,
                                    imageUrl: tokenImage,
                                }}
                            />
                        </>
                    )}
                    {video.createdAt && (
                        <>
                            <span aria-hidden>·</span>
                            <span>{formatRelativeTime(new Date(video.createdAt).toISOString())}</span>
                        </>
                    )}
                    {action}
                </div>
            </div>
        </div>
    );
}
