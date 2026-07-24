"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, Play } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAudioOwner } from "@/lib/audio-bus";
import { VolumeMorph, CaptionsMorph } from "@/components/morph-icons";
import { MarketCapChip } from "@/components/tokens/market-cap-chip";
import { Squircle } from "@/components/ui/squircle";

// Redesigned hero: a featured video player + a 3×3 grid of picker thumbnails,
// then up/down arrows. The frozen multi-item carousel lives in home-carousel.tsx
// (used by _legacy).
//
// - Player (left): the active featured video, sharp-cornered (rounded-none),
//   autoplaying muted+looped with player chrome (mute / captions / LIVE badge).
//   The whole player is a <Link> to its watch page. Prev/next remount the
//   <video> (keyed on the active id).
// - Grid (middle): 9 videos as buttons — blurred thumbnail bg + centered avatar
//   (the original peek style). Click one to make it the active player video.
// - Arrows (right): page the grid through the video list in blocks of 9.

const ROW_H = "h-[clamp(240px,24vw,380px)]";
const HERO_WRAP = "mx-auto w-full max-w-[1100px] px-4";
const PER_PAGE = 9;

interface CarouselVideo {
    id: string;
    title: string;
    videoUrl?: string | null;
    thumbnailUrl: string | null;
    /** Live stream rather than a VOD — drives the LIVE badge. */
    isLive?: boolean | null;
    /** Launched token (if any) — drives the market-cap chip. */
    ticker?: string | null;
    tokenId?: string | null;
    tokenAddress?: string | null;
    marketCapUsd?: number | null;
    user: { username: string | null; avatar_url: string | null };
}

function watchHref(v: CarouselVideo) {
    return `/${v.user.username}/${v.id}`;
}

export function HomeCarousel({ videos }: { videos: CarouselVideo[] }) {
    const n = videos.length;
    const [active, setActive] = useState(0);
    const [page, setPage] = useState(0);
    const pageCount = Math.max(1, Math.ceil(n / PER_PAGE));
    const skipPage = (dir: -1 | 1) => setPage((p) => (p + dir + pageCount) % pageCount);

    if (n === 0) return null;
    const v = videos[active];
    const pageVideos = videos.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

    return (
        <div className={`group/carousel relative ${HERO_WRAP}`}>
            <div className={`flex items-stretch gap-3 ${ROW_H}`}>
                {/* Featured player — sharp-cornered, fills the remaining width. */}
                <Link
                    href={watchHref(v)}
                    aria-label={`Watch ${v.title}`}
                    className="group/active relative block flex-1 overflow-hidden rounded-none bg-muted outline-none"
                >
                    {v.videoUrl ? (
                        <ActivePanel key={v.id} v={v} />
                    ) : (
                        <>
                            {v.thumbnailUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                            )}
                            <div className="absolute left-4 top-3 z-30 flex items-center gap-2">
                                {v.isLive && <LiveBadge />}
                                <MarketCapChip tokenSlug={v.tokenAddress ?? v.tokenId} marketCap={v.marketCapUsd} />
                            </div>
                        </>
                    )}

                    {/* Persistent info bar — flat dark pill (no gradient). */}
                    <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-3 rounded-2xl bg-black/40 p-2.5 backdrop-blur-md">
                        <div className="size-10 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/15">
                            {v.user.avatar_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.user.avatar_url} alt="" className="size-full object-cover" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-bold tracking-tight text-white">{v.title}</p>
                            {v.user.username && (
                                <p className="truncate text-sm font-semibold text-white/65">@{v.user.username}</p>
                            )}
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-white/85">
                            <Play className="size-4 fill-current" />
                            Watch Now
                        </span>
                    </div>
                </Link>

                {/* 3×3 picker grid — a square tied to the row height. */}
                <div className="grid aspect-square h-full shrink-0 grid-cols-3 grid-rows-3 gap-2">
                    {pageVideos.map((pv, i) => {
                        const globalIdx = page * PER_PAGE + i;
                        return (
                            <GridCell
                                key={pv.id}
                                v={pv}
                                isActive={globalIdx === active}
                                onClick={() => setActive(globalIdx)}
                            />
                        );
                    })}
                </div>

                {/* Right-side squircle arrows — page the grid (shorts-style). */}
                <div className="flex shrink-0 flex-col justify-center gap-3">
                    <HeroArrow dir="up" onClick={() => skipPage(-1)} />
                    <HeroArrow dir="down" onClick={() => skipPage(1)} />
                </div>
            </div>
        </div>
    );
}

// One picker button: blurred thumbnail background + centered creator avatar
// (the original closed-peek look). Selected cell gets a solid white ring.
function GridCell({ v, isActive, onClick }: { v: CarouselVideo; isActive: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`Play ${v.title}`}
            className={`group/cell relative cursor-pointer overflow-hidden rounded-2xl bg-muted outline-none transition ${
                isActive ? "ring-2 ring-white" : "ring-1 ring-white/10 hover:ring-white/30"
            }`}
        >
            {v.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 size-full scale-125 object-cover blur-lg" />
            )}
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="size-9 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/25">
                    {v.user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.user.avatar_url} alt={v.user.username ?? ""} className="size-full object-cover" />
                    ) : (
                        <div className="flex size-full items-center justify-center text-sm font-bold text-white/80">
                            {(v.user.username ?? "?")[0]?.toUpperCase()}
                        </div>
                    )}
                </div>
            </div>
        </button>
    );
}

// Red LIVE pill. No positioning of its own — the caller places it.
function LiveBadge() {
    return (
        <span className="flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
            <span className="size-1.5 rounded-full bg-white" />
            Live
        </span>
    );
}

// Squircle up/down control (shorts-style vertical arrows, but smooth-cornered).
// No border → autoEffects off, so no injected wrapper div (see the Squircle
// autoEffects tradeoff); the button is the direct flex child at its own size.
function HeroArrow({ dir, onClick }: { dir: "up" | "down"; onClick: () => void }) {
    const Icon = dir === "up" ? ChevronUp : ChevronDown;
    return (
        <Squircle asChild radius={18} autoEffects={false}>
            <button
                type="button"
                onClick={onClick}
                aria-label={dir === "up" ? "Previous videos" : "Next videos"}
                className="flex size-16 items-center justify-center bg-panel2 text-white/80 backdrop-blur-sm transition-colors hover:bg-baseborder/45 hover:text-white"
            >
                <Icon className="size-10" strokeWidth={2.5} />
            </button>
        </Squircle>
    );
}

// A single control button inside a grouped pill (matches the /video player's
// chrome: transparent, with a hover wash).
function PlayerButton({ label, onClick, wide, children }: { label: string; onClick: (e: React.MouseEvent) => void; wide?: boolean; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={`flex h-8 ${wide ? "w-12" : "w-8"} cursor-pointer items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/20 hover:text-white`}
        >
            {children}
        </button>
    );
}

// The active video + player chrome — mute toggle, caption toggle (only when the
// post has caption tracks), and a LIVE badge for streams. Captions mirror the
// full player: the chosen track is kept "hidden" so it fires cuechange without
// the browser's native box, and the current cue is surfaced as one line.
function ActivePanel({ v }: { v: CarouselVideo }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const { isOwner, hasOwner, claim, release } = useAudioOwner();
    const [userMuted, setUserMuted] = useState(false);
    const [captionsOn, setCaptionsOn] = useState(false);
    const [captionText, setCaptionText] = useState("");
    // The hero is the page's default audio source; it goes silent only when the
    // user mutes it or another video (a hovered card) claims audio.
    const effectiveMuted = userMuted || !isOwner;

    const { data: captionsData } = trpc.content.getCaptions.useQuery(
        { postId: v.id },
        { staleTime: Infinity },
    );
    const captionTracks = captionsData?.captions ?? [];
    const defaultCaption = Math.max(0, captionTracks.findIndex((c) => c.isDefault));

    // Autoplay (muted, to satisfy the browser policy) and claim audio on mount —
    // the hero is the default audio source.
    useEffect(() => {
        const el = videoRef.current;
        if (el) {
            el.muted = true;
            void el.play().catch(() => {});
        }
        claim();
        return () => release();
    }, [claim, release]);

    // Reclaim audio when nothing else owns it (a hovered card let go), unless
    // the user explicitly muted the hero.
    useEffect(() => {
        if (!hasOwner && !userMuted) claim();
    }, [hasOwner, userMuted, claim]);

    // Reflect the effective mute state on the element. Bound imperatively (not
    // via the muted prop) so the frequent caption re-renders never reassert it.
    useEffect(() => {
        const el = videoRef.current;
        if (el) el.muted = effectiveMuted;
    }, [effectiveMuted]);

    // Surface the active caption cue as a single line via cuechange.
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
            setCaptionText(
                cues && cues.length
                    ? Array.from(cues).map((c) => (c as VTTCue).text).join(" ").replace(/\s+/g, " ").trim()
                    : "",
            );
        };
        sync();
        active.addEventListener("cuechange", sync);
        return () => active.removeEventListener("cuechange", sync);
    }, [captionsOn, defaultCaption, captionTracks.length]);

    // The buttons live inside the player's <Link>; swallow the click so it
    // doesn't navigate to the watch page.
    const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

    return (
        <>
            <video
                ref={videoRef}
                src={v.videoUrl ?? undefined}
                poster={v.thumbnailUrl ?? undefined}
                loop
                playsInline
                // Required so cross-origin (Supabase Storage) <track> VTT cues
                // are allowed to load.
                crossOrigin="anonymous"
                className="absolute inset-0 size-full object-cover"
            >
                {captionTracks.map((track) => (
                    <track key={track.id} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} />
                ))}
            </video>

            {/* LIVE badge + market cap, top-left. */}
            <div className="absolute left-4 top-3 z-30 flex items-center gap-2">
                {v.isLive && <LiveBadge />}
                <MarketCapChip tokenSlug={v.tokenAddress ?? v.tokenId} marketCap={v.marketCapUsd} />
            </div>

            {/* Mute / captions pill, top-right — revealed on hover of the player. */}
            <div className="absolute right-3 top-3 z-30 flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover/active:opacity-100">
                <div className="flex items-center gap-0.5 rounded-full bg-black/40 p-1 backdrop-blur-sm">
                    <PlayerButton label={effectiveMuted ? "Unmute" : "Mute"} wide onClick={(e) => { stop(e); const next = !userMuted; setUserMuted(next); if (!next) claim(); }}>
                        <VolumeMorph level={effectiveMuted ? "muted" : "full"} className="size-5" />
                    </PlayerButton>
                    {captionTracks.length > 0 && (
                        <PlayerButton label={captionsOn ? "Turn off captions" : "Turn on captions"} wide onClick={(e) => { stop(e); setCaptionsOn((c) => !c); }}>
                            <CaptionsMorph on={captionsOn} className="size-5" />
                        </PlayerButton>
                    )}
                </div>
            </div>

            {/* Current caption line, above the persistent info bar. */}
            {captionsOn && captionText && (
                <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center px-4">
                    <span className="max-w-full truncate rounded bg-black/70 px-2 py-0.5 text-[15px] font-semibold text-white">
                        {captionText}
                    </span>
                </div>
            )}
        </>
    );
}

export function HomeCarouselSkeleton() {
    return (
        <div className={HERO_WRAP}>
            <div className={`flex items-stretch gap-3 ${ROW_H}`}>
                <div className="relative flex-1 overflow-hidden rounded-none bg-muted">
                    <div className="absolute inset-0 shimmer-skeleton rounded-none" />
                    <div className="absolute inset-x-3 bottom-3 flex items-center gap-3">
                        <div className="size-10 shrink-0 rounded-full shimmer-skeleton" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-4 w-1/3 rounded-full shimmer-skeleton" />
                            <div className="h-3 w-1/5 rounded-full shimmer-skeleton" />
                        </div>
                    </div>
                </div>
                <div className="grid aspect-square h-full shrink-0 grid-cols-3 grid-rows-3 gap-2">
                    {Array.from({ length: PER_PAGE }).map((_, i) => (
                        <div key={i} className="rounded-2xl shimmer-skeleton" />
                    ))}
                </div>
                <div className="flex shrink-0 flex-col justify-center gap-3">
                    <Squircle asChild radius={18} autoEffects={false}>
                        <div className="size-16 shimmer-skeleton" />
                    </Squircle>
                    <Squircle asChild radius={18} autoEffects={false}>
                        <div className="size-16 shimmer-skeleton" />
                    </Squircle>
                </div>
            </div>
        </div>
    );
}
