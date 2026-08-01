"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAudioOwner } from "@/lib/audio-bus";
import { useAmbientGlow, AMBIENT_PRESET } from "@/hooks/use-ambient-glow";
import { VolumeMorph, CaptionsMorph } from "@/components/morph-icons";
import { MarketCapChip } from "@/components/tokens/market-cap-chip";

// Home hero: ONE featured video, parked at the top-left of the centre column.
// It autoplays muted+looped with player chrome (mute / captions / LIVE badge)
// and the whole thing is a <Link> to its watch page.
//
// The 3×3 picker grid and the up/down paging arrows that used to sit beside it
// were pulled while the column layout is rebuilt — restore them from git
// (they were removed in the commit that introduced HERO_BOX) if they come
// back. `videos` still takes the whole list so paging can return without a
// signature change; only the first entry renders today. The frozen multi-item
// carousel is separate: home-carousel.tsx, used by _legacy.

// Height-driven: 45svh, with 16:9 setting the width from it. svh (not vh) so
// the mobile URL bar collapsing doesn't resize it mid-scroll. max-w-full is the
// backstop — on a tall window 45svh wants more width than the centre column
// has, and there the column wins and the box goes narrower than 16:9. The
// media inside is object-contain, so that never crops the frame; it just adds
// bars.
const HERO_BOX = "h-[45svh] aspect-video  max-w-full";
// No padding at all: the hero sits flush in the column's top-left corner, and
// the only offset above it is the column's own header clearance.
const HERO_WRAP = "w-full ";

// The player's corner radius, carried by the container AND by the media inside
// it — they have to match, so there's one definition.
//
// The duplication is load-bearing, not belt-and-braces. In ambient mode the
// container CANNOT be overflow-hidden (the glow canvas is injected as the
// video's sibling and clipping erases the whole effect), so its radius has
// nothing to clip and the media paints its own square corners on top. That's
// invisible for a letterboxed source — object-contain keeps it off the corners,
// so you see the container's rounded bg-muted behind it — and only shows up
// when the frame fills the box edge to edge. Rounding the media itself is what
// fixes it without reintroducing a clip.
const MEDIA_RADIUS = "rounded-xl";

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
    return `/video/${v.id}`;
}

/**
 * @param fill Stretch to the parent's width instead of the fixed 45svh box —
 *   what the home page's screen slot wants, since that slot already sets its
 *   own 16:9. The standalone box is kept for any caller that isn't sized.
 * @param chrome Everything drawn OVER the video: the info bar, the LIVE badge
 *   and market-cap chip, and the mute/captions controls. Off for the home
 *   screen while its design is worked out — the video plays bare. Nothing is
 *   deleted, so turning it back on restores the lot.
 * @param ambient The watch page's ambient glow — a blurred, scaled copy of the
 *   frame painted behind the player so colour spills past its edges. The
 *   library inserts its canvas into the VIDEO'S PARENT, which is this Link, so
 *   the Link becomes the ambient container: no overflow-hidden (that would clip
 *   away the entire effect) and `isolate`, matching the watch page's setup.
 *   Every ancestor up to where the glow should fade also has to stay unclipped.
 * @param onEnded Advance to whatever comes next. Passing it turns LOOPING OFF —
 *   a looping element never fires `ended`, so the two are the same switch. Left
 *   off, the player keeps repeating one video, which is what every caller but
 *   the home hero wants.
 */
export function HomeCarousel({
    videos,
    fill = false,
    chrome = true,
    ambient = false,
    onEnded,
}: {
    videos: CarouselVideo[];
    fill?: boolean;
    chrome?: boolean;
    ambient?: boolean;
    onEnded?: () => void;
}) {
    const v = videos[0];
    if (!v) return null;

    return (
        <div className={`group/carousel relative ${fill ? "size-full" : HERO_WRAP}`}>
            <div className={fill ? "size-full" : "flex items-start"}>
                {/* Featured player, top-left of the column. */}
                <Link
                    href={watchHref(v)}
                    aria-label={`Watch ${v.title}`}
                    className={`group/active relative block ${MEDIA_RADIUS} bg-muted outline-none ${
                        ambient
                            ? "ambient-video-container isolate overflow-visible [contain:none]"
                            : "overflow-hidden"
                    } ${fill ? "size-full" : `shrink-0 ${HERO_BOX}`}`}
                >
                    {v.videoUrl ? (
                        <ActivePanel key={v.id} v={v} chrome={chrome} ambient={ambient} onEnded={onEnded} />
                    ) : (
                        <>
                            {v.thumbnailUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                // Same fit rule as the <video> below — this is
                                // the same slot when there's no videoUrl.
                                <img src={v.thumbnailUrl} alt="" className={`absolute inset-0 size-full object-contain ${MEDIA_RADIUS}`} />
                            )}
                            {chrome && (
                                <div className="absolute left-4 top-3 z-30 flex items-center gap-2">
                                    {v.isLive && <LiveBadge />}
                                    <MarketCapChip tokenSlug={v.tokenAddress ?? v.tokenId} marketCap={v.marketCapUsd} />
                                </div>
                            )}
                        </>
                    )}

                    {/* Persistent info bar — flat dark pill (no gradient). */}
                    {chrome && (
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
                    )}
                </Link>
            </div>
        </div>
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
function ActivePanel({ v, chrome = true, ambient = false, onEnded }: { v: CarouselVideo; chrome?: boolean; ambient?: boolean; onEnded?: () => void }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    // A tight halo. Size comes from two knobs that compound — `scale` (how far
    // past the video the canvas is drawn; at 1 it matches the video, so only the
    // blur escapes) and `blur` (how far that feathers). Opacity and brightness
    // only dim a glow; they never shrink it.
    //
    // These numbers were this component's, and are now the app's: AMBIENT_PRESET
    // is what the watch and live players run too.
    useAmbientGlow(videoRef, AMBIENT_PRESET, ambient);
    const { isOwner, hasOwner, claim, release } = useAudioOwner();
    const [userMuted, setUserMuted] = useState(false);
    const [captionsOn, setCaptionsOn] = useState(false);
    const [captionText, setCaptionText] = useState("");
    // The hero is the page's default audio source; it goes silent only when the
    // user mutes it or another video (a hovered card) claims audio.
    const effectiveMuted = userMuted || !isOwner;

    const { data: captionsData } = trpc.content.getCaptions.useQuery(
        { postId: v.id },
        // No chrome means no caption toggle, so there is nothing to fetch for.
        { staleTime: Infinity, enabled: chrome },
    );
    const captionTracks = captionsData?.captions ?? [];
    const defaultCaption = Math.max(0, captionTracks.findIndex((c) => c.isDefault));

    // Autoplay (muted, to satisfy the browser policy) and claim audio on mount —
    // the hero is the default audio source.
    useEffect(() => {
        const el = videoRef.current;
        if (el) {
            el.muted = true;
            void el.play().catch(() => { });
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
                // A looping element never reaches `ended`, so a caller that
                // wants the next video gets no loop.
                loop={!onEnded}
                onEnded={onEnded}
                playsInline
                // Required so cross-origin (Supabase Storage) <track> VTT cues
                // are allowed to load.
                crossOrigin="anonymous"
                // contain, NOT cover: the slot is 16:9 but the source often
                // isn't (square and portrait uploads are common), and cover
                // zooms until the short edge fills — cropping the sides off a
                // square video and reading as "why is this so zoomed in".
                // Contain fits the whole frame and leaves bars, which the
                // ambient glow then fills with a blurred copy of the frame
                // rather than dead space.
                //
                // MEDIA_RADIUS here, not just on the container: see its note —
                // in ambient mode the container can't clip, so a frame that
                // fills the box has to round itself. Harmless when letterboxed
                // (the bars are transparent, so there's nothing at the corners
                // to round) and it never touches the glow canvas, which is a
                // sibling and must stay unrounded to spill.
                className={`absolute inset-0 size-full object-contain ${MEDIA_RADIUS}`}
            >
                {captionTracks.map((track) => (
                    <track key={track.id} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} />
                ))}
            </video>

            {/* LIVE badge + market cap, top-left. */}
            {chrome && (
                <div className="absolute left-4 top-3 z-30 flex items-center gap-2">
                    {v.isLive && <LiveBadge />}
                    <MarketCapChip tokenSlug={v.tokenAddress ?? v.tokenId} marketCap={v.marketCapUsd} />
                </div>
            )}

            {/* Mute / captions pill, top-right — revealed on hover of the player. */}
            {chrome && (
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
            )}

            {/* Current caption line, above the persistent info bar. */}
            {chrome && captionsOn && captionText && (
                <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center px-4">
                    <span className="max-w-full truncate rounded bg-black/70 px-2 py-0.5 text-[15px] font-semibold text-white">
                        {captionText}
                    </span>
                </div>
            )}
        </>
    );
}

// Same box as the real hero, so nothing shifts when the feed lands.
export function HomeCarouselSkeleton() {
    return (
        <div className={HERO_WRAP}>
            <div className="flex items-start">
                <div className={`relative shrink-0 overflow-hidden rounded-none bg-muted ${HERO_BOX}`}>
                    <div className="absolute inset-0 shimmer-skeleton" />
                    <div className="absolute inset-x-3 bottom-3 flex items-center gap-3">
                        <div className="size-10 shrink-0 rounded-full shimmer-skeleton" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-4 w-1/3 rounded-full shimmer-skeleton" />
                            <div className="h-3 w-1/5 rounded-full shimmer-skeleton" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
