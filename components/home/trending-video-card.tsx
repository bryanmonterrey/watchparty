"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { staggerPulse } from "@/lib/skeleton-stagger";
import { Skeleton } from "@/components/ui/skeleton";
import { ClockIcon, QueueIcon, VerticalDotsIcon } from "@/components/icons";
import { VolumeMorph, CaptionsMorph } from "@/components/morph-icons";
import { useAudioOwner } from "@/lib/audio-bus";
import { MarketCapChip } from "@/components/tokens/market-cap-chip";

// The trending-section video card (desktopdesigns/Frame 463.svg), extracted
// from desktop-home.tsx so home's Recommended tab can render the same card
// without pulling the whole legacy surface (hero carousel, embla, category
// row) into its chunk. Anatomy and behaviour are unchanged — desktop-home
// imports it back from here.

export interface FeedVideo {
    id: string;
    title: string;
    videoUrl: string | null;
    thumbnailUrl: string | null;
    category?: string | null;
    duration?: number | null;
    /** Live stream rather than a VOD — drives the hero LIVE badge. */
    isLive?: boolean | null;
    /** Signed-in user's saved playback position (seconds); 0/undefined = none. */
    watchedTime?: number | null;
    /** Launched token (if any) — drives the market-cap chip. */
    ticker?: string | null;
    tokenId?: string | null;
    tokenAddress?: string | null;
    marketCapUsd?: number | null;
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
    return `/video/${v.id}`;
}

// ─── TRENDING HOVER COLORS (experimental — easy to remove) ──────────────────
// Random palette tint for the trending card hover backdrop, pulled from the
// globals.css design tokens. To revert: delete this block + the `hoverColor`
// useState in TrendingVideoCard, and restore the motion.div's backgroundColor
// to the original "rgba(74,74,74,0.3)" / "rgba(74,74,74,0)".
const HOVER_PALETTE = [
    "var(--color-jewel)",
    "var(--color-soft-pink)",
    "var(--color-soft-blue)",
    "var(--color-bleu)",
    "var(--color-pastel-yellow)",
    "var(--color-bitcoin-orange)",
    "var(--color-sharp-gray)",
    "var(--color-soft-gray)",
    "var(--color-vice-purple)",
];
function randomHoverColor() {
    return HOVER_PALETTE[Math.floor(Math.random() * HOVER_PALETTE.length)];
}
// ────────────────────────────────────────────────────────────────────────────

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
            className="flex size-9 items-center justify-center rounded-full bg-transparent hover:bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
        >
            {children}
        </button>
    );
}

// The thumbnail plays an inline muted preview on hover (YouTube-style); the
// bottom scrubber mirrors the real video-player scrubber's three layers — back
// track, buffered ("what's loaded"), and the colored playhead. The colored
// layer shows the saved watch position at rest and the live preview position
// while hovering, and the whole scrubber only shows when there's watch history
// (otherwise it appears on hover). Top-left controls are watch-later/queue for
// movies, else the preview transport (mute / play / captions).
export function TrendingVideoCard({ v }: { v: FeedVideo }) {
    const saveProgress = trpc.content.saveProgress.useMutation();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    // Page-wide audio coordination: a card preview only takes sound when the
    // user unmutes it, which mutes the hero; muting/leaving hands sound back.
    const { isOwner, claim, release } = useAudioOwner();
    // Resume point that survives hover-in/out — re-hovering picks up where the
    // preview left off rather than restarting.
    const resumeRef = useRef(v.watchedTime ?? 0);
    const [hovered, setHovered] = useState(false);
    const [muted, setMuted] = useState(true);
    // Silent whenever the user muted it OR another video owns page audio.
    const effectiveMuted = muted || !isOwner;
    const [playing, setPlaying] = useState(false);
    const [previewTime, setPreviewTime] = useState(v.watchedTime ?? 0);
    const [previewBuffered, setPreviewBuffered] = useState(0);
    const [previewDuration, setPreviewDuration] = useState(0);
    // Watch position shown at rest; advances as hovering plays the preview.
    const [watched, setWatched] = useState(v.watchedTime ?? 0);

    const [captionsOn, setCaptionsOn] = useState(false);
    const [captionText, setCaptionText] = useState("");
    // TRENDING HOVER COLORS (experimental — easy to remove): one random palette
    // color chosen per card mount. See HOVER_PALETTE above.
    const [hoverColor] = useState(randomHoverColor);

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

    // Captions: keep the chosen track "hidden" (fires cuechange without the
    // browser's tiny multi-line native rendering) and surface the current cue
    // as a single line in our own overlay. Re-runs as tracks attach (the
    // preview (re)mounts on hover).
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        const tracks = el.textTracks;
        let active: TextTrack | null = null;
        for (let i = 0; i < tracks.length; i++) {
            if (captionsOn && i === defaultCaption) {
                tracks[i].mode = "hidden";
                active = tracks[i];
            } else {
                tracks[i].mode = "disabled";
            }
        }
        if (!active) {
            setCaptionText("");
            return;
        }
        const sync = () => {
            const cues = active!.activeCues;
            const text = cues && cues.length
                ? Array.from(cues)
                    .map((c) => (c as VTTCue).text)
                    .join(" ")
                    .replace(/\s+/g, " ")
                    .trim()
                : "";
            setCaptionText(text);
        };
        sync();
        active.addEventListener("cuechange", sync);
        return () => active.removeEventListener("cuechange", sync);
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
        el.muted = effectiveMuted;
        if (hovered) void el.play().catch(() => {});
    }, [hovered, effectiveMuted]);

    // Release page audio if this card is unmounted while it owned sound.
    useEffect(() => release, [release]);

    const endHover = () => {
        setHovered(false);
        setPreviewBuffered(0);
        setCaptionText("");
        release();
        // Persist the hovered-to position to watch history (and the at-rest bar).
        const t = resumeRef.current;
        setWatched(t);
        if (t > 1 && duration > 0) saveProgress.mutate({ postId: v.id, currentTime: t });
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.preventDefault();
        const next = !muted;
        setMuted(next);
        // Unmuting takes page audio (muting the hero / other cards). Called from
        // the handler — never inside the setState updater, which runs in render.
        if (!next) claim();
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
                // TRENDING HOVER COLORS (experimental): static random palette tint
                // (style.backgroundColor) faded in by the opacity spring. To
                // revert, drop the style prop and restore backgroundColor here to
                // "rgba(74,74,74,0.3)" / "rgba(74,74,74,0)".
                style={{ backgroundColor: hoverColor }}
                animate={
                    hovered
                        ? { scale: 1, opacity: 0.1 }
                        : { scale: 0.5, opacity: 0 }
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
                            muted={effectiveMuted}
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

                {/* Market cap over the thumbnail, top-left. Outside the <Link>
                    (sibling, like the controls) so it's not a nested interactive
                    element; it routes to the token page itself. */}
                <MarketCapChip
                    tokenSlug={v.tokenAddress ?? v.tokenId}
                    marketCap={v.marketCapUsd}
                    className="absolute left-3 top-3 z-10"
                />

                {/* Controls, vertically stacked on the right. Outside the <Link>
                    so they aren't nested interactive elements; z-10 keeps them
                    above the preview. No play/pause — hovering drives playback. */}
                <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    {movie ? (
                        <>
                            <CardIconButton label="Watch later"><ClockIcon className="size-5" /></CardIconButton>
                            <CardIconButton label="Add to queue"><QueueIcon className="size-5" /></CardIconButton>
                        </>
                    ) : (
                        <>
                            <CardIconButton label={effectiveMuted ? "Unmute" : "Mute"} onClick={toggleMute}>
                                <VolumeMorph level={effectiveMuted ? "muted" : "full"} className="size-5" />
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
                                    <CaptionsMorph on={captionsOn} className="size-5" />
                                </CardIconButton>
                            )}
                        </>
                    )}
                </div>

                {/* Captions overlay: single current line, kept above the time
                    nail / scrubber, in sync via the track's cuechange. */}
                {hovered && captionsOn && captionText && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center px-4">
                        <span className="max-w-full truncate rounded bg-black/70 px-2 py-0.5 text-sm font-semibold text-white sm:text-[15px]">
                            {captionText}
                        </span>
                    </div>
                )}

                {/* Time nail, bottom-left: video length at rest, live preview
                    position while hovering. */}
                {(duration > 0 || hovered) && (
                    <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-sm bg-black/30 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
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
                            className="absolute inset-y-0 left-0 w-full origin-left bg-twitter2 transition-transform duration-200 ease-linear"
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
                    <VerticalDotsIcon className="size-5" />
                </button>
            </div>
        </div>
    );
}

// Skeleton matching the Frame 463 wireframe: rounded thumbnail, avatar, three
// decreasing pill rows (two title lines + username), and the vertical-dots
// menu. Every element shares one stagger style so the whole card reads as a
// single object (see staggerPulse — flat fill, the ripple is retired).
export function TrendingVideoCardSkeleton({ index, count }: { index: number; count: number }) {
    const pulse = staggerPulse(index, count);
    return (
        <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-[19px]">
                <Skeleton style={pulse} className="aspect-[382/243] w-full rounded-[19px]" />
            </div>
            <div className="flex items-start gap-3">
                <Skeleton style={pulse} className="size-11 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2 py-1">
                    <Skeleton style={pulse} className="h-4 w-full rounded-full" />
                    <Skeleton style={pulse} className="h-4 w-[82%] rounded-full" />
                    <Skeleton style={pulse} className="h-3.5 w-1/2 rounded-full" />
                </div>
            </div>
        </div>
    );
}
