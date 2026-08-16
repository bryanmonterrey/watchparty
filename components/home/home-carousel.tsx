"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAudioOwner } from "@/lib/audio-bus";
import { VolumeMorph, CaptionsMorph } from "@/components/morph-icons";
import { MarketCapChip } from "@/components/tokens/market-cap-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerPulse } from "@/lib/skeleton-stagger";

// Hero strip per desktopdesigns/homecarousel.svg, scaled to 24 videos with a
// seamless infinite loop.
//
// Layout: a horizontally-scrollable row of fixed-width peek panels and one
// wide active panel. Pure CSS — the active panel animates its `width` and the
// strip uses native scrolling, so nothing runs on the JS thread per frame.
//
// Infinite wrap: the list is rendered THREE times and the viewport is parked
// in the middle copy. When scrolling crosses into a side copy, scrollLeft jumps
// one copy-width back into the middle — invisible, because the copies are
// pixel-identical (the active index applies to every copy, so all three stay
// the same width even while a panel is expanded).
//
// Interaction:
//   • Click a closed panel → it expands (active) and centers.
//   • Click the open panel  → navigates to its watch page.
//   • Arrows                → scroll one video left/right (don't open anything).
//   • Drag (mouse/pen)      → scroll; touch keeps native momentum.
//
// Closed panel: blurred thumbnail with the creator avatar centered.
// Open panel:   the video autoplays (muted, looped) with player chrome —
//               mute toggle, caption toggle (when the post has caption tracks),
//               and a LIVE badge for streams (see ActivePanel).

const PEEK_W = 116; // px — closed panel width
const GAP = 16; // px — matches gap-4
const COPIES = 3;
const MID = 1; // the copy the viewport lives in

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

export function HomeCarousel({ videos }: { videos: CarouselVideo[] }) {
    const n = videos.length;
    // Default-active the middle panel, matching the SVG's centered hero.
    const [active, setActive] = useState(() => Math.floor(n / 2));
    const scrollerRef = useRef<HTMLDivElement>(null);
    // Flat refs across all copies: index = copy * n + realIndex.
    const panelRefs = useRef<(HTMLAnchorElement | null)[]>([]);
    const didMount = useRef(false);

    // Scroll the middle copy's panel `index` to the viewport centre. Explicit
    // scroll math rather than scrollIntoView, which no-ops before the first paint
    // and so left the active panel off-screen at load.
    const centerActive = useCallback((behavior: ScrollBehavior, index: number) => {
        const el = scrollerRef.current;
        const panel = panelRefs.current[MID * n + index];
        if (!el || !panel) return;
        const er = el.getBoundingClientRect();
        const pr = panel.getBoundingClientRect();
        const left = el.scrollLeft + (pr.left - er.left) - (er.width - pr.width) / 2;
        el.scrollTo({ left, behavior });
    }, [n]);

    // Only center on first mount (the hero starts centered, already wide).
    // Clicking a closed peek expands it in place — re-centering there caused a
    // jarring post-click shift. Skip (prev/next) DOES re-center, separately.
    useLayoutEffect(() => {
        if (!didMount.current) {
            didMount.current = true;
            centerActive("auto", active);
        }
    }, [active, n, centerActive]);

    // Prev/next video: advance the open panel (wrapping) and re-center it. The
    // newly-active panel is a narrow peek until its width transition (500ms)
    // runs, so centre on a delay — measuring it sooner would land ~320px off.
    const skipTimer = useRef<number | null>(null);
    const skip = (dir: -1 | 1) => {
        const next = (active + dir + n) % n;
        setActive(next);
        if (skipTimer.current) window.clearTimeout(skipTimer.current);
        skipTimer.current = window.setTimeout(() => centerActive("smooth", next), 520);
    };
    useEffect(() => () => { if (skipTimer.current) window.clearTimeout(skipTimer.current); }, []);

    // Seamless wrap: keep scrollLeft within one list-period of the middle copy,
    // jumping by exactly that period when it strays. The period MUST be the true
    // repeat distance — measured as the gap between the same video in adjacent
    // copies — not scrollWidth/COPIES, which also folds in the side padding and
    // inter-copy gaps and would leave a ~25px seam on every wrap.
    const recenter = () => {
        const el = scrollerRef.current;
        const a = panelRefs.current[0];
        const b = panelRefs.current[n];
        if (!el || !a || !b) return;
        const period = b.getBoundingClientRect().left - a.getBoundingClientRect().left;
        if (period <= 0) return;
        if (el.scrollLeft < period) el.scrollLeft += period;
        else if (el.scrollLeft >= 2 * period) el.scrollLeft -= period;
    };

    const scrollByVideo = (dir: -1 | 1) =>
        scrollerRef.current?.scrollBy({ left: dir * (PEEK_W + GAP), behavior: "smooth" });

    // Click-drag to scroll (mouse/pen only — touch keeps native momentum).
    // Incremental (delta per move) so it survives the wrap's scrollLeft jumps.
    // `moved` suppresses the click that would otherwise end the drag.
    const drag = useRef({ on: false, startX: 0, lastX: 0, moved: false, captured: false });
    const onPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === "touch" || !scrollerRef.current) return;
        // Do NOT setPointerCapture here: capturing on pointerdown retargets the
        // synthesized click to the scroller (the common ancestor of down/up), so
        // a panel never receives its click and click-to-open silently breaks.
        // Capture only once an actual drag begins (below).
        drag.current = { on: true, startX: e.clientX, lastX: e.clientX, moved: false, captured: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const el = scrollerRef.current;
        if (!el || !drag.current.on) return;
        // Incremental (delta from last move) keeps scrolling correct across the
        // wrap's scrollLeft jumps; the drag-vs-click decision uses NET distance.
        el.scrollLeft -= e.clientX - drag.current.lastX;
        drag.current.lastX = e.clientX;
        if (!drag.current.moved && Math.abs(e.clientX - drag.current.startX) > 5) {
            drag.current.moved = true;
            el.setPointerCapture(e.pointerId); // now safe — a plain click never reaches here
            drag.current.captured = true;
        }
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (drag.current.captured) scrollerRef.current?.releasePointerCapture(e.pointerId);
        drag.current.on = false;
        drag.current.captured = false;
    };

    if (n === 0) return null;

    return (
        <div className="group/carousel relative w-full">
            <div
                ref={scrollerRef}
                onScroll={recenter}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDragStart={(e) => e.preventDefault()}
                className="hidden-scrollbar relative z-10 flex h-[clamp(260px,23vw,360px)] cursor-grab gap-4 overflow-x-auto px-[3%] select-none active:cursor-grabbing"
            >
                {Array.from({ length: COPIES }).flatMap((_, copy) =>
                    videos.map((v, i) => {
                        const isActive = i === active;
                        return (
                            <Link
                                key={`${copy}-${v.id}`}
                                ref={(el) => { panelRefs.current[copy * n + i] = el; }}
                                href={watchHref(v)}
                                // Click a closed panel to open it (no navigation);
                                // click the open one to actually go watch.
                                onClick={(e) => {
                                    // Swallow the click that ends a drag.
                                    if (drag.current.moved) {
                                        e.preventDefault();
                                        drag.current.moved = false;
                                        return;
                                    }
                                    if (!isActive) {
                                        e.preventDefault();
                                        setActive(i);
                                    }
                                }}
                                aria-label={isActive ? v.title : `Open ${v.title}`}
                                style={{ width: isActive ? "min(760px, 52vw)" : `${PEEK_W}px` }}
                                className={`group/active relative block h-full shrink-0 overflow-hidden rounded-[20px] bg-muted outline-none transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                                    isActive ? "" : "cursor-pointer"
                                }`}
                            >
                                {isActive ? (
                                    <>
                                        {/* Autoplay + player chrome (mute / captions /
                                            LIVE badge) only in the middle copy — the side
                                            copies are off-screen buffers, so one <video>
                                            is enough; their active clone shows the still. */}
                                        {v.videoUrl && copy === MID ? (
                                            <ActivePanel v={v} onPrev={() => skip(-1)} onNext={() => skip(1)} />
                                        ) : (
                                            <>
                                                {v.thumbnailUrl && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={v.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                                                )}
                                                {/* Open state: LIVE + market cap, top-left. */}
                                                <div className="absolute left-4 top-3 z-30 flex items-center gap-2">
                                                    {v.isLive && <LiveBadge />}
                                                    <MarketCapChip tokenSlug={v.tokenAddress ?? v.tokenId} marketCap={v.marketCapUsd} />
                                                </div>
                                            </>
                                        )}
                                        {/* Now-playing bar (reveals with the controls on hover):
                                            avatar + title (truncates) on the left, Watch Now CTA
                                            on the right. The whole active panel is a <Link>, so the
                                            CTA navigates via the parent — it's a styled span, not a
                                            nested <a>. */}
                                        <div className="absolute left-4 bottom-3 flex items-center gap-3 rounded-xl p-4 bg-black/30 backdrop-blur-sm opacity-0 transition-opacity duration-200 group-hover/active:opacity-100">
                                            <div className="size-10 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/15">
                                                {v.user.avatar_url && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={v.user.avatar_url} alt="" className="size-full object-cover" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-lg font-bold tracking-tight text-white">{v.title}</p>
                                                {v.user.username && (
                                                    <p className="truncate text-sm font-semibold text-white/65">@{v.user.username}</p>
                                                )}
                                            </div>
                                            <span className="flex shrink-0 items-center gap-1.5 ml-2 rounded-full bg-white px-4 py-3 text-sm font-bold text-black transition-colors hover:bg-white/85">
                                                <Play className="size-5 fill-current" />
                                                Watch Now
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Closed: blurred thumbnail + centered avatar. scale hides
                                            the blur's transparent edge against the panel border. */}
                                        {v.thumbnailUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={v.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover blur-xl" />
                                        )}
                                        <div className="absolute inset-0 bg-black/40" />
                                        {/* Closed state: market cap only, top-center (peek is 116px). */}
                                        <div className="absolute inset-x-0 top-3 z-30 flex justify-center">
                                            <MarketCapChip tokenSlug={v.tokenAddress ?? v.tokenId} marketCap={v.marketCapUsd} />
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="size-14 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/25">
                                                {v.user.avatar_url ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={v.user.avatar_url} alt={v.user.username ?? ""} className="size-full object-cover" />
                                                ) : (
                                                    <div className="flex size-full items-center justify-center text-lg font-bold text-white/80">
                                                        {(v.user.username ?? "?")[0]?.toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </Link>
                        );
                    })
                )}
            </div>

            {/* Netflix-style edge controls: flat black/50 blurred rectangle that
                fades in on carousel hover. They SCROLL the strip one video; they
                don't open anything. */}
            <CarouselArrow side="left" onClick={() => scrollByVideo(-1)} />
            <CarouselArrow side="right" onClick={() => scrollByVideo(1)} />
        </div>
    );
}

// Red LIVE pill. No positioning of its own — the caller places it (absolute on
// a still panel, or in ActivePanel's top-left control column).
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

// Skip-to-next-video glyph (lifted from the player chrome SVG); mirrored for prev.
function SkipIcon({ dir, className }: { dir: "prev" | "next"; className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            fill="currentColor"
            style={dir === "prev" ? { transform: "scaleX(-1)" } : undefined}
        >
            <path d="M20 20C20.26 20 20.51 19.89 20.70 19.70C20.89 19.51 21 19.26 21 19V5C21 4.73 20.89 4.48 20.70 4.29C20.51 4.10 20.26 4 20 4C19.73 4 19.48 4.10 19.29 4.29C19.10 4.48 19 4.73 19 5V19C19 19.26 19.10 19.51 19.29 19.70C19.48 19.89 19.73 20 20 20ZM5.04 19.77L18 12L5.04 4.22C4.84 4.10 4.60 4.03 4.36 4.03C4.12 4.03 3.89 4.09 3.68 4.21C3.47 4.32 3.30 4.49 3.18 4.70C3.06 4.91 2.99 5.14 3 5.38V18.61C2.99 18.85 3.06 19.08 3.18 19.29C3.30 19.50 3.47 19.67 3.68 19.79C3.89 19.90 4.12 19.96 4.36 19.96C4.60 19.96 4.84 19.89 5.04 19.77Z" />
        </svg>
    );
}

// The middle-copy active panel: the one real <video>, plus player chrome —
// prev/next-video skip, mute toggle, caption toggle (only when the post has
// caption tracks), and a LIVE badge for streams. The control pill and the
// title block reveal on hover of the panel (group/active); the LIVE badge
// stays put. Captions mirror the full player: the chosen track is kept
// "hidden" so it fires cuechange without the browser's native multi-line box,
// and the current cue is surfaced as one line in our overlay.
function ActivePanel({ v, onPrev, onNext }: { v: CarouselVideo; onPrev: () => void; onNext: () => void }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const { isOwner, hasOwner, claim, release } = useAudioOwner();
    const [userMuted, setUserMuted] = useState(false);
    const [captionsOn, setCaptionsOn] = useState(false);
    const [captionText, setCaptionText] = useState("");
    // The hero is the page's default audio source; it goes silent only when the
    // user mutes it or another video (a hovered card) claims audio.
    const effectiveMuted = userMuted || !isOwner;

    // One query per active video (only the middle copy renders ActivePanel, and
    // it remounts when the active index changes).
    const { data: captionsData } = trpc.content.getCaptions.useQuery(
        { postId: v.id },
        { staleTime: Infinity },
    );
    const captionTracks = captionsData?.captions ?? [];
    const defaultCaption = Math.max(0, captionTracks.findIndex((c) => c.isDefault));

    // Autoplay (muted, to satisfy the browser policy) and claim audio on mount —
    // the hero is the default audio source. Unmuting is then applied
    // optimistically below; real sound resumes on the first user gesture.
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

    // The buttons live inside the panel's <Link>; swallow the click so it
    // neither navigates to the watch page nor bubbles to the expand handler.
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

            {/* Player controls, top-right — grouped pills (prev/next · mute/cc),
                revealed on hover of the panel. */}
            <div className="absolute right-3 top-3 z-30 flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover/active:opacity-100">
                <div className="flex items-center gap-0.5 rounded-full bg-black/40 p-1 backdrop-blur-sm">
                    <PlayerButton label="Previous video" wide onClick={(e) => { stop(e); onPrev(); }}>
                        <SkipIcon dir="prev" className="size-5" />
                    </PlayerButton>
                    <PlayerButton label="Next video" wide onClick={(e) => { stop(e); onNext(); }}>
                        <SkipIcon dir="next" className="size-5" />
                    </PlayerButton>
                </div>
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

            {/* Current caption line, above the title/avatar block. */}
            {captionsOn && captionText && (
                <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
                    <span className="max-w-full truncate rounded bg-black/70 px-2 py-0.5 text-[15px] font-semibold text-white">
                        {captionText}
                    </span>
                </div>
            )}
        </>
    );
}

function CarouselArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
    const Icon = side === "left" ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={side === "left" ? "Scroll left" : "Scroll right"}
            className={`group/arrow absolute inset-y-0 z-20 flex w-[68px] items-center bg-black/50 backdrop-blur-xs transition-opacity duration-300 opacity-0 group-hover/carousel:opacity-100 ${
                side === "left" ? "left-0 justify-start pl-3" : "right-0 justify-end pr-3"
            }`}
        >
            <Icon className="size-9 text-white drop-shadow-lg transition-transform duration-200 group-hover/arrow:scale-110" strokeWidth={2.5} />
        </button>
    );
}

// 8 peeks on each side of the centered active panel.
const SKELETON_PANELS = 17;
const SKELETON_ACTIVE_INDEX = 8;

export function HomeCarouselSkeleton() {
    // Mirrors the carousel's resting state: the wide active panel centered with
    // narrow peeks flanking it. Same panel dimensions/structure as the live
    // version (avatar on closed panels, avatar + caption on the active one),
    // minus the scrolling, edge arrows, and interaction. Each panel pulses as
    // one object; the brightness spike travels across the row one panel at a
    // time (see staggerPulse).
    const activePulse = staggerPulse(SKELETON_ACTIVE_INDEX, SKELETON_PANELS);
    return (
        <div className="relative w-full overflow-hidden">
            <div className="flex h-[clamp(260px,23vw,360px)] justify-center gap-4 px-[3%]">
                {/* Enough peeks to fill the widest viewport on each side of the
                    active panel; overflow-hidden trims the surplus. */}
                {Array.from({ length: 8 }).map((_, i) => (
                    <ClosedPanelSkeleton key={`l-${i}`} index={i} count={SKELETON_PANELS} />
                ))}
                {/* Active panel: blurred thumbnail with avatar + caption at the bottom. */}
                <div className="relative h-full w-[min(760px,52vw)] shrink-0 overflow-hidden rounded-[20px] bg-muted">
                    <Skeleton style={activePulse} className="absolute inset-0 size-full rounded-none" />
                    {/* These three sit ON TOP of the full-bleed skeleton above,
                        so their backdrop is itself --color-skeleton. At the
                        shared colour they'd be invisible and the panel would
                        render as one featureless block, losing the avatar and
                        caption shapes that make it read as this component.
                        Hence the `!` — the documented escape hatch from the
                        app-wide skeleton colour in globals.css, for a skeleton
                        whose surface is lighter than the canvas. */}
                    <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-6">
                        <Skeleton style={activePulse} className="size-10 shrink-0 rounded-full bg-zinc-700!" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <Skeleton style={activePulse} className="h-5 w-1/2 bg-zinc-700!" />
                            <Skeleton style={activePulse} className="h-3.5 w-1/4 bg-zinc-700!" />
                        </div>
                    </div>
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                    <ClosedPanelSkeleton key={`r-${i}`} index={SKELETON_ACTIVE_INDEX + 1 + i} count={SKELETON_PANELS} />
                ))}
            </div>
        </div>
    );
}

function ClosedPanelSkeleton({ index, count }: { index: number; count: number }) {
    // Closed panel: blurred thumbnail with the creator avatar centered.
    const pulse = staggerPulse(index, count);
    return (
        <div className="relative h-full w-[116px] shrink-0 overflow-hidden rounded-[20px] bg-muted">
            <Skeleton className="absolute inset-0 size-full rounded-none" />
        </div>
    );
}
