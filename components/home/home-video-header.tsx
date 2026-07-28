"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon, FavouriteIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
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

/** Eight burst dots. Each gets its own vector, size, duration and delay so the
 *  spray reads as organic instead of a symmetrical starburst — the snippet
 *  expects these to be randomised per like, which is why they're generated on
 *  click rather than baked into the markup. */
const PARTICLE_COUNT = 8;

function makeParticles() {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        // Even angular spread, jittered so it never looks mechanical.
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
        const dist = 14 + Math.random() * 12;
        return {
            "--px": `${Math.cos(angle) * dist}px`,
            "--py": `${Math.sin(angle) * dist}px`,
            "--pdur": `${480 + Math.round(Math.random() * 240)}ms`,
            "--pdelay": `${Math.round(Math.random() * 60)}ms`,
            "--p-end-scale": `${0.4 + Math.random() * 0.4}`,
            "--psize": `${0.7 + Math.random() * 0.8}`,
        } as React.CSSProperties;
    });
}

function LikeButton({ video }: { video: HomeFeedVideo }) {
    // Seeded from the feed (getVideoFeed resolves isLiked per viewer), then
    // owned here so the tap is instant.
    const [liked, setLiked] = useState(!!video.isLiked);
    const [count, setCount] = useState(video.likes ?? 0);
    const [bursting, setBursting] = useState(false);
    const [particles, setParticles] = useState<React.CSSProperties[]>(() => makeParticles());
    const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // A rapid re-like would otherwise leave a stale timer to clear .is-bursting
    // mid-animation, and an unmount mid-burst would set state on a dead node.
    useEffect(() => () => {
        if (burstTimer.current) clearTimeout(burstTimer.current);
    }, []);

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
        if (!next) return;
        if (burstTimer.current) clearTimeout(burstTimer.current);
        setParticles(makeParticles());
        setBursting(false);
        // Reflow between removing and re-adding the class is what makes the
        // burst replay on a second like instead of sitting at its end state.
        requestAnimationFrame(() => {
            setBursting(true);
            burstTimer.current = setTimeout(() => setBursting(false), 900);
        });
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

export function HomeVideoHeader({ video, className }: { video: HomeFeedVideo; className?: string }) {
    const username = video.user.username;
    const watchHref = `/video/${video.id}`;
    // The mint once live, else the token row id — /[slug] resolves both.
    const tokenSlug = video.tokenAddress ?? video.tokenId;
    const hasToken = !!tokenSlug && !!video.ticker;

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
                {/* Ghost, not a solid pill: the like button beside it carries the
                    only fill in this row, and this is a navigation away from the
                    hero rather than the row's primary action. The arrow trails
                    the label and nudges on hover — the standard "this goes
                    somewhere" affordance. */}
                <Link
                    href={watchHref}
                    className="group flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-zinc-300 transition-colors hover:text-white"
                >
                    go to video
                    <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className="size-4.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                        strokeWidth={2}
                    />
                </Link>
            </div>
        </div>
    );
}
