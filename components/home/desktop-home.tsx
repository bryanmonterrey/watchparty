"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { EllipsisVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "@/components/ui/carousel";
import { ClockIcon, QueueIcon } from "@/components/icons";
import { VolumeMorph, CaptionsMorph } from "@/components/morph-icons";
import { HomeCarousel, HomeCarouselSkeleton } from "./home-carousel";
import { HOME_CATEGORIES } from "@/lib/data/home-categories";

// Desktop home per desktopdesigns/homepage.svg: full-bleed hero carousel,
// then Trending / Categories / IRL sections. Same feed procedures as before —
// only the presentation changed (the old endless-grid VideoFeed is retired
// from this page).

interface FeedVideo {
    id: string;
    title: string;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    category?: string | null;
    duration?: number | null;
    /** Signed-in user's saved playback position (seconds); 0/undefined = none. */
    watchedTime?: number | null;
    user: { username: string | null; avatar_url: string | null };
}

// No dedicated "movie" flag on posts — a movie is just a video in the Movies
// category. Movies get watch-later/queue actions; everything else gets the
// inline-preview transport controls (mute / play / captions).
function isMovie(v: FeedVideo) {
    return (v.category ?? "").toLowerCase().includes("movie");
}

// m:ss, or h:mm:ss past an hour.
function formatTime(seconds: number) {
    const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const ss = String(sec).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function watchHref(v: FeedVideo) {
    return `/${v.user.username}/${v.id}`;
}

function SectionHeader({ title, href }: { title: string; href: string }) {
    return (
        <div className="flex items-baseline justify-between pb-4">
            <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
            <Link href={href} className="text-sm font-extrabold text-pastel-yellow hover:text-white/80">
                View all
            </Link>
        </div>
    );
}

function CardIconButton({
    label,
    onClick,
    children,
}: {
    label: string;
    onClick?: (e: React.MouseEvent) => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            // Default: swallow the click so it doesn't fall through to the
            // thumbnail <Link>. Interactive buttons pass their own handler.
            onClick={onClick ?? ((e) => e.preventDefault())}
            className="flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
            {children}
        </button>
    );
}

// Trending-section card per desktopdesigns/Frame 463.svg. The thumbnail plays
// an inline muted preview on hover (YouTube-style); the bottom scrubber mirrors
// the real video-player scrubber's three layers — back track, buffered ("what's
// loaded"), and the colored playhead. The colored layer shows the saved watch
// position at rest and the live preview position while hovering, and the whole
// scrubber only shows when there's watch history (otherwise it appears on
// hover). Top-left controls are watch-later/queue for movies, else the preview
// transport (mute / play / captions).
function VideoCard({ v }: { v: FeedVideo }) {
    const saveProgress = trpc.content.saveProgress.useMutation();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    // Resume point that survives hover-in/out — re-hovering picks up where the
    // preview left off rather than restarting.
    const resumeRef = useRef(v.watchedTime ?? 0);
    const [hovered, setHovered] = useState(false);
    const [muted, setMuted] = useState(true);
    const [playing, setPlaying] = useState(false);
    const [previewTime, setPreviewTime] = useState(v.watchedTime ?? 0);
    const [previewBuffered, setPreviewBuffered] = useState(0);
    const [previewDuration, setPreviewDuration] = useState(0);
    // Watch position shown at rest; advances as hovering plays the preview.
    const [watched, setWatched] = useState(v.watchedTime ?? 0);

    const [captionsOn, setCaptionsOn] = useState(false);

    const movie = isMovie(v);
    const duration = v.duration ?? 0;
    const hasHistory = duration > 0 && watched > 1;

    // Caption tracks (same source as the full player); fetched lazily once the
    // card is hovered so the grid doesn't fire a query per card up front.
    const { data: captionsData } = trpc.content.getCaptions.useQuery(
        { postId: v.id },
        { enabled: hovered && !movie, staleTime: Infinity },
    );
    const captionTracks = captionsData?.captions ?? [];
    const defaultCaption = Math.max(0, captionTracks.findIndex((c) => c.isDefault));

    // Drive the native <track> visibility from the toggle. Re-run as tracks
    // attach (preview (re)mounts on hover) so the chosen track shows/hides.
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        const tracks = el.textTracks;
        for (let i = 0; i < tracks.length; i++) {
            tracks[i].mode = captionsOn && i === defaultCaption ? "showing" : "hidden";
        }
    }, [captionsOn, defaultCaption, hovered, previewDuration, captionTracks.length]);

    // While hovering, the live preview drives the scrubber; at rest it reflects
    // the saved watch position. Buffered is only meaningful during preview.
    const scrubDuration = hovered && previewDuration > 0 ? previewDuration : duration;
    const position = hovered ? previewTime : watched;
    const positionPct = scrubDuration > 0 ? Math.min(1, position / scrubDuration) : 0;
    const bufferedPct = hovered && scrubDuration > 0 ? Math.min(1, previewBuffered / scrubDuration) : 0;
    const showScrubber = hasHistory || hovered;

    // Mount/unmount the preview <video> with hover; (re)apply mute + autoplay.
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.muted = muted;
        if (hovered) void el.play().catch(() => {});
    }, [hovered, muted]);

    const endHover = () => {
        setHovered(false);
        setPreviewBuffered(0);
        // Persist the hovered-to position to watch history (and the at-rest bar).
        const t = resumeRef.current;
        setWatched(t);
        if (t > 1 && duration > 0) saveProgress.mutate({ postId: v.id, currentTime: t });
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.preventDefault();
        setMuted((m) => !m);
    };

    return (
        <div
            className="group relative isolate z-0 flex flex-col gap-3"
            onMouseEnter={() => v.videoUrl && setHovered(true)}
            onMouseLeave={endHover}
        >
            {/* Hover backdrop, ported from sidebar's video-card: a black base
                with a gray panel that springs in just past the card edges. */}
            <div className="pointer-events-none absolute inset-0 -z-20 rounded-2xl" />
            <motion.div
                aria-hidden
                initial={false}
                animate={
                    hovered
                        ? { scale: 1, opacity: 1, backgroundColor: "rgba(74,74,74,0.3)" }
                        : { scale: 0.5, opacity: 0, backgroundColor: "rgba(74,74,74,0)" }
                }
                transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.5 }}
                className="pointer-events-none absolute inset-[-12px] -z-10 rounded-3xl"
            />
            <div className="relative overflow-hidden rounded-2xl bg-muted">
                <Link href={watchHref(v)} className="block aspect-[382/243]">
                    {v.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={v.thumbnailUrl}
                            alt={v.title}
                            loading="lazy"
                            className={cn(
                                "size-full object-cover transition-transform duration-300",
                                hovered && playing && "opacity-0"
                            )}
                        />
                    )}
                    {hovered && v.videoUrl && (
                        <video
                            ref={videoRef}
                            src={v.videoUrl}
                            poster={v.thumbnailUrl ?? undefined}
                            muted={muted}
                            loop
                            playsInline
                            preload="metadata"
                            // Required so cross-origin (Supabase Storage) <track>
                            // VTT cues are allowed to load and render natively.
                            crossOrigin="anonymous"
                            className="absolute inset-0 size-full object-cover"
                            onLoadedMetadata={(e) => {
                                setPreviewDuration(e.currentTarget.duration || 0);
                                // Resume from where the last hover left off.
                                if (resumeRef.current > 0.5 && resumeRef.current < e.currentTarget.duration) {
                                    e.currentTarget.currentTime = resumeRef.current;
                                }
                            }}
                            onTimeUpdate={(e) => {
                                const t = e.currentTarget.currentTime;
                                resumeRef.current = t;
                                setPreviewTime(t);
                            }}
                            onProgress={(e) => {
                                const b = e.currentTarget.buffered;
                                if (b.length) setPreviewBuffered(b.end(b.length - 1));
                            }}
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                        >
                            {captionTracks.map((track) => (
                                <track
                                    key={track.id}
                                    kind="subtitles"
                                    src={track.url}
                                    srcLang={track.language}
                                    label={track.label}
                                />
                            ))}
                        </video>
                    )}
                </Link>

                {/* Controls, vertically stacked on the right. Outside the <Link>
                    so they aren't nested interactive elements; z-10 keeps them
                    above the preview. No play/pause — hovering drives playback. */}
                <div className="absolute right-3 top-3 z-10 flex flex-col gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    {movie ? (
                        <>
                            <CardIconButton label="Watch later"><ClockIcon className="size-[18px]" /></CardIconButton>
                            <CardIconButton label="Add to queue"><QueueIcon className="size-[18px]" /></CardIconButton>
                        </>
                    ) : (
                        <>
                            <CardIconButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
                                <VolumeMorph level={muted ? "muted" : "full"} className="size-[18px]" />
                            </CardIconButton>
                            {/* Only when the video actually has caption tracks. */}
                            {captionTracks.length > 0 && (
                                <CardIconButton
                                    label={captionsOn ? "Turn off captions" : "Turn on captions"}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setCaptionsOn((c) => !c);
                                    }}
                                >
                                    <CaptionsMorph on={captionsOn} className="size-[18px]" />
                                </CardIconButton>
                            )}
                        </>
                    )}
                </div>

                {/* Time nail, bottom-left: video length at rest, live preview
                    position while hovering. */}
                {(duration > 0 || hovered) && (
                    <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-lg bg-black/80 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
                        {formatTime(hovered ? previewTime : duration)}
                    </div>
                )}

                {/* Scrubber: back track, buffered (loaded), colored playhead. */}
                {showScrubber && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[4px] overflow-hidden bg-white/25">
                        <div
                            className="absolute inset-y-0 left-0 w-full origin-left bg-white/50"
                            style={{ transform: `scaleX(${bufferedPct})` }}
                        />
                        <div
                            className="absolute inset-y-0 left-0 w-full origin-left bg-[#4453FF] transition-transform duration-200 ease-linear"
                            style={{ transform: `scaleX(${positionPct})` }}
                        />
                    </div>
                )}
            </div>

            <div className="flex items-start gap-3">
                <Link
                    href={`/${v.user.username}`}
                    className="size-11 shrink-0 overflow-hidden rounded-full bg-muted"
                >
                    {v.user.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.user.avatar_url} alt="" className="size-full object-cover" />
                    )}
                </Link>
                <Link href={watchHref(v)} className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[15px] font-bold leading-snug text-white">{v.title}</p>
                    {v.user.username && (
                        <p className="mt-1 truncate text-sm font-medium text-white/55">@{v.user.username}</p>
                    )}
                </Link>
                <button
                    type="button"
                    aria-label="More options"
                    className="-mr-1 shrink-0 rounded-full p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <EllipsisVertical className="size-5" />
                </button>
            </div>
        </div>
    );
}

// Skeleton matching the Frame 463 wireframe: rounded thumbnail, avatar, three
// decreasing pill rows (two title lines + username), and the vertical-dots
// menu. Every element shares one stagger style so the whole card pulses as a
// single object; the row lights one card at a time (see staggerPulse).
const TRENDING_SKELETON_COUNT = 4;

function VideoCardSkeleton({ index, count }: { index: number; count: number }) {
    const pulse = staggerPulse(index, count);
    return (
        <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-[19px]">
                <Skeleton style={pulse} className="aspect-[382/243] w-full rounded-[19px]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[4px] bg-white/10" />
            </div>
            <div className="flex items-start gap-3">
                <Skeleton style={pulse} className="size-16 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2 py-1">
                    <Skeleton style={pulse} className="h-4 w-full rounded-full" />
                    <Skeleton style={pulse} className="h-4 w-[82%] rounded-full" />
                    <Skeleton style={pulse} className="h-3.5 w-1/2 rounded-full" />
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1 pt-1.5">
                    <Skeleton style={pulse} className="size-1 rounded-full" />
                    <Skeleton style={pulse} className="size-1 rounded-full" />
                    <Skeleton style={pulse} className="size-1 rounded-full" />
                </div>
            </div>
        </div>
    );
}

function CardRowSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
            {Array.from({ length: TRENDING_SKELETON_COUNT }).map((_, i) => (
                <VideoCardSkeleton key={i} index={i} count={TRENDING_SKELETON_COUNT} />
            ))}
        </div>
    );
}

// Category tile: artwork on top with a staggered pulse placeholder that fades
// to the image once it loads, then the title and tag badges below it.
function CategoryCard({ c, index, count }: { c: (typeof HOME_CATEGORIES)[number]; index: number; count: number }) {
    const [loaded, setLoaded] = useState(false);
    return (
        <Link href={c.slug} className="group block w-36 shrink-0">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-muted">
                {!loaded && (
                    <div className="absolute inset-0 bg-zinc-800" style={staggerPulse(index, count)} />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={c.thumbnailUrl}
                    alt={c.title}
                    loading="lazy"
                    onLoad={() => setLoaded(true)}
                    className={cn(
                        "absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105",
                        loaded ? "opacity-100" : "opacity-0"
                    )}
                />
            </div>
            <div className="pt-2">
                <p className="truncate text-sm font-extrabold text-white">{c.title}</p>
                {c.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.tags.slice(0, 2).map((t) => (
                            <span
                                key={t}
                                className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </Link>
    );
}

// Full-height edge control, matching the hero carousel's arrows: a flat
// black/blurred bar that fades in on carousel hover (not a rounded button).
function EdgeArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
    const Icon = side === "left" ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={side === "left" ? "Scroll left" : "Scroll right"}
            className={cn(
                "group/arrow absolute inset-y-3 z-20 flex w-16 items-center bg-black/50 backdrop-blur-xs opacity-0 transition-opacity duration-300 group-hover/trend:opacity-100",
                side === "left" ? "left-0 justify-start pl-2" : "right-0 justify-end pr-2"
            )}
        >
            <Icon
                className="size-8 text-white drop-shadow-lg transition-transform duration-200 group-hover/arrow:scale-110"
                strokeWidth={2.5}
            />
        </button>
    );
}

// Trending row: a draggable carousel (drag-to-scroll like the hero, native
// momentum on touch) with hero-style edge arrows that hide when you can't
// scroll that way, plus a ghost "Show all / Show less" toggle that swaps it for
// a 12-video grid.
function TrendingCarousel({ videos }: { videos: FeedVideo[] }) {
    const [expanded, setExpanded] = useState(false);
    const [api, setApi] = useState<CarouselApi>();
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);

    useEffect(() => {
        if (!api) return;
        const update = () => {
            setCanPrev(api.canScrollPrev());
            setCanNext(api.canScrollNext());
        };
        update();
        api.on("select", update);
        api.on("reInit", update);
        return () => {
            api.off("select", update);
            api.off("reInit", update);
        };
    }, [api]);

    return (
        <div className="flex flex-col gap-4">
            {expanded ? (
                <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
                    {videos.map((v) => (
                        <VideoCard key={v.id} v={v} />
                    ))}
                </div>
            ) : (
                <Carousel
                    setApi={setApi}
                    opts={{ align: "start", dragFree: true, containScroll: "trimSnaps" }}
                    className="group/trend"
                >
                    {/* py-3 gives the cards' hover backdrop room before the embla
                        viewport clips it vertically. */}
                    <CarouselContent className="-ml-5 py-3">
                        {videos.map((v) => (
                            <CarouselItem key={v.id} className="basis-1/2 pl-5 xl:basis-1/4">
                                <VideoCard v={v} />
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    {canPrev && <EdgeArrow side="left" onClick={() => api?.scrollPrev()} />}
                    {canNext && <EdgeArrow side="right" onClick={() => api?.scrollNext()} />}
                </Carousel>
            )}
            <div className="flex justify-center">
                <Button
                    variant="ghost"
                    onClick={() => setExpanded((e) => !e)}
                    className="text-sm font-extrabold text-white/70 hover:bg-transparent hover:text-white"
                >
                    {expanded ? "Show less" : "Show all"}
                </Button>
            </div>
        </div>
    );
}

export function DesktopHome() {
    const feed = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 36 },
        { getNextPageParam: (p) => p.nextCursor }
    );
    const irl = trpc.content.getVideoFeed.useInfiniteQuery(
        { limit: 4, category: "IRL" },
        { getNextPageParam: (p) => p.nextCursor }
    );

    const videos = feed.data?.pages.flatMap((p) => p.videos) ?? [];
    const heroVideos = videos.slice(0, 24);
    // 12 trending videos after the hero set; fall back to the first 12 when the
    // feed is too short to fill both.
    const trendingTail = videos.slice(24, 36);
    const trendingVideos = trendingTail.length ? trendingTail : videos.slice(0, 12);
    const irlVideos = irl.data?.pages.flatMap((p) => p.videos) ?? [];

    return (
        <div className="flex flex-col gap-7 pb-16 md:pt-[var(--header-height)]">
            {/* ── Hero carousel: full-bleed coverflow accordion ──────────── */}
            <div className="pt-4">

                {feed.isLoading ? <HomeCarouselSkeleton /> : <HomeCarousel videos={heroVideos} />}
            </div>

            <div className="flex flex-col gap-7 px-6">
                <section>
                    <SectionHeader title="Trending" href="/search" />
                    {feed.isLoading ? (
                        <CardRowSkeleton />
                    ) : (
                        <TrendingCarousel videos={trendingVideos} />
                    )}
                </section>

                <section>
                    <SectionHeader title="Categories" href="/category" />
                    <div className="hidden-scrollbar flex items-start gap-4 overflow-x-auto">
                        {HOME_CATEGORIES.map((c, i) => (
                            <CategoryCard key={c.slug} c={c} index={i} count={HOME_CATEGORIES.length} />
                        ))}
                    </div>
                </section>

                {/* Hide the whole section when it resolves empty — only show the
                    header/skeleton while loading or once there are streams. */}
                {(irl.isLoading || irlVideos.length > 0) && (
                    <section>
                        <SectionHeader title="IRL" href="/search?q=IRL" />
                        {irl.isLoading ? (
                            <CardRowSkeleton />
                        ) : (
                            <div className="grid grid-cols-2 gap-5 xl:grid-cols-4">
                                {irlVideos.slice(0, 4).map((v) => (
                                    <VideoCard key={v.id} v={v} />
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
