"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon, FavouriteIcon, PlayCircleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { formatMarketCap } from "@/components/tokens/market-cap-chip";
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
function compactCount(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
    return String(Math.round(n));
}

/** 7xKXtg…Bpump — enough to eyeball against a block explorer, not so much that
 *  it eats the row. The full value still goes to the clipboard. */
function shortAddress(a: string): string {
    return a.length <= 13 ? a : `${a.slice(0, 6)}…${a.slice(-5)}`;
}

function VerifiedBadge({ tier }: { tier: HomeFeedVideo["user"]["verifiedTier"] }) {
    if (tier === "verified") return <VerifiedBadgeIcon className="size-4 shrink-0" />;
    if (tier === "business") return <BusinessBadgeIcon className="size-4 shrink-0" />;
    if (tier === "government") return <GovBadgeIcon className="size-4 shrink-0" />;
    return null;
}

/** Contract address + copy. Confirms with a tick rather than a toast — the
 *  action is local and instant, and a toast for it would be noise. */
function ContractAddress({ address }: { address: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <button
            type="button"
            onClick={() => {
                void navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
            }}
            aria-label={copied ? "contract address copied" : "copy contract address"}
            title={address}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-semibold text-zinc-400 transition-colors hover:text-white"
        >
            <span className="font-mono tabular-nums">{shortAddress(address)}</span>
            <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                className={cn("size-3.5", copied && "text-jewel")}
                strokeWidth={2}
            />
        </button>
    );
}

function LikeButton({ video }: { video: HomeFeedVideo }) {
    // Seeded from the feed (getVideoFeed resolves isLiked per viewer), then
    // owned here so the tap is instant.
    const [liked, setLiked] = useState(!!video.isLiked);
    const [count, setCount] = useState(video.likes ?? 0);

    const toggle = trpc.content.toggleLike.useMutation({
        onError: () => {
            // Roll the optimistic flip back rather than leaving the UI lying.
            setLiked((prev) => !prev);
            setCount((c) => (liked ? c + 1 : Math.max(0, c - 1)));
        },
    });

    return (
        <button
            type="button"
            onClick={() => {
                setLiked((prev) => !prev);
                setCount((c) => (liked ? Math.max(0, c - 1) : c + 1));
                toggle.mutate({ postId: video.id });
            }}
            aria-pressed={liked}
            aria-label={liked ? "unlike" : "like"}
            className={cn(
                "flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors",
                liked ? "bg-pastelred/15 text-pastelred" : "bg-white/[0.06] text-zinc-300 hover:text-white",
            )}
        >
            {/* fill-current, not a fixed colour: the heart's path carries no
                fill attribute, so the svg's fill inherits down — and following
                the button's text colour keeps the two in step. Same trick
                NotificationsIcon uses on this identical path. */}
            <HugeiconsIcon
                icon={FavouriteIcon}
                className={cn("size-4.5", liked && "fill-current")}
                strokeWidth={2}
            />
            {count > 0 && <span className="tabular-nums">{compactCount(count)}</span>}
        </button>
    );
}

export function HomeVideoHeader({ video, className }: { video: HomeFeedVideo; className?: string }) {
    const username = video.user.username;
    const watchHref = username ? `/${username}/${video.id}` : `/${video.id}`;
    // The mint once live, else the token row id — /[slug] resolves both.
    const tokenSlug = video.tokenAddress ?? video.tokenId;
    const hasToken = !!tokenSlug && !!video.ticker;

    return (
        <div className={cn("flex min-w-0 items-start gap-3", className)}>
            <Link href={username ? `/${username}` : "#"} className="shrink-0" aria-label={username ?? "creator"}>
                {/* Always the shared placeholder, never a letter fallback. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={video.user.avatar_url || "/avatar.png"}
                    alt=""
                    className="size-11 rounded-full bg-zinc-800 object-cover"
                />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="line-clamp-1 text-[17px] font-bold leading-tight tracking-tight text-white">
                    {video.title}
                </h2>

                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-zinc-500">
                    {username && (
                        <Link
                            href={`/${username}`}
                            className="flex min-w-0 items-center gap-1 font-semibold text-zinc-300 transition-colors hover:text-white"
                        >
                            <span className="truncate">@{username}</span>
                            <VerifiedBadge tier={video.user.verifiedTier} />
                        </Link>
                    )}
                    {video.isLive ? (
                        <>
                            <span aria-hidden>·</span>
                            <span className="flex items-center gap-1.5 font-bold text-pastelred">
                                <span className="size-1.5 animate-pulse rounded-full bg-pastelred" />
                                live
                            </span>
                        </>
                    ) : (
                        video.views != null && (
                            <>
                                <span aria-hidden>·</span>
                                <span className="tabular-nums">{compactCount(video.views)} views</span>
                            </>
                        )
                    )}
                    {video.createdAt && (
                        <>
                            <span aria-hidden>·</span>
                            <span>{formatRelativeTime(new Date(video.createdAt).toISOString())}</span>
                        </>
                    )}
                </div>

                {/* Token row — only when the video actually launched a coin. */}
                {hasToken && (
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                            href={`/${tokenSlug}`}
                            className="flex items-center rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-extrabold text-white transition-colors hover:bg-white/10"
                        >
                            ${video.ticker}
                        </Link>
                        {video.marketCapUsd != null && (
                            <Link
                                href={`/${tokenSlug}`}
                                className="text-[12px] font-extrabold tabular-nums text-emerald-400 transition-opacity hover:opacity-80"
                            >
                                {formatMarketCap(video.marketCapUsd)}
                                <span className="ml-1 font-semibold text-zinc-600">mc</span>
                            </Link>
                        )}
                        {/* Only a LIVE token has a contract address; a draft has
                            no mint yet, so there'd be nothing to copy. */}
                        {video.tokenAddress && <ContractAddress address={video.tokenAddress} />}
                    </div>
                )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
                <LikeButton video={video} />
                <Link
                    href={watchHref}
                    className="flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-bold text-black transition-opacity hover:opacity-90"
                >
                    <HugeiconsIcon icon={PlayCircleIcon} className="size-4.5" strokeWidth={2} />
                    go to video
                </Link>
            </div>
        </div>
    );
}
