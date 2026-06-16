"use client";

import { useState, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
// Open panel:   the video autoplays (muted, looped) with a caption.

const PEEK_W = 116; // px — closed panel width
const GAP = 16; // px — matches gap-4
const COPIES = 3;
const MID = 1; // the copy the viewport lives in

interface CarouselVideo {
    id: string;
    title: string;
    videoUrl?: string | null;
    thumbnailUrl: string | null;
    user: { username: string | null; avatar_url: string | null };
}

function watchHref(v: CarouselVideo) {
    return `/${v.user.username}/${v.id}`;
}

export function HomeCarousel({ videos }: { videos: CarouselVideo[] }) {
    const n = videos.length;
    // Default-active the middle panel, matching the SVG's centered hero.
    const [active, setActive] = useState(() => Math.floor(n / 2));
    const scrollerRef = useRef<HTMLDivElement>(null);
    // Flat refs across all copies: index = copy * n + realIndex.
    const panelRefs = useRef<(HTMLAnchorElement | null)[]>([]);
    const didMount = useRef(false);

    // Center the middle copy's active panel. On mount it's instant (the active
    // panel already starts wide). On a click-to-open it's delayed by the width
    // transition, then smooth — otherwise we'd center the still-narrow 116px
    // panel and it would finish ~320px off-centre once it expanded rightward.
    // Explicit scroll math rather than scrollIntoView, which no-ops before the
    // first paint and so left the active panel off-screen at load.
    useLayoutEffect(() => {
        const center = (behavior: ScrollBehavior) => {
            const el = scrollerRef.current;
            const panel = panelRefs.current[MID * n + active];
            if (!el || !panel) return;
            const er = el.getBoundingClientRect();
            const pr = panel.getBoundingClientRect();
            const left = el.scrollLeft + (pr.left - er.left) - (er.width - pr.width) / 2;
            el.scrollTo({ left, behavior });
        };
        // Only center on first mount (the hero starts centered). Opening a panel
        // expands it in place — the old post-expansion re-center caused a jarring
        // shift after the click.
        if (!didMount.current) {
            didMount.current = true;
            center("auto");
        }
    }, [active, n]);

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
                className="hidden-scrollbar flex h-[clamp(260px,23vw,360px)] cursor-grab gap-4 overflow-x-auto px-[3%] select-none active:cursor-grabbing"
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
                                className={`relative block h-full shrink-0 overflow-hidden rounded-[20px] bg-muted outline-none transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                                    isActive ? "" : "cursor-pointer"
                                }`}
                            >
                                {isActive ? (
                                    <>
                                        {/* Autoplay only in the middle copy — the side
                                            copies are off-screen buffers, so one <video>
                                            is enough; their active clone shows the still. */}
                                        {v.videoUrl && copy === MID ? (
                                            <video
                                                src={v.videoUrl}
                                                poster={v.thumbnailUrl ?? undefined}
                                                autoPlay
                                                muted
                                                loop
                                                playsInline
                                                className="absolute inset-0 size-full object-cover"
                                            />
                                        ) : (
                                            v.thumbnailUrl && (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={v.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                                            )
                                        )}
                                        {/* bottom gradient keeps the caption legible */}
                                        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 38%, transparent 62%)" }} />
                                        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-6">
                                            <div className="size-10 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/15">
                                                {v.user.avatar_url && (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={v.user.avatar_url} alt="" className="size-full object-cover" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xl font-extrabold tracking-tight text-white">{v.title}</p>
                                                {v.user.username && (
                                                    <p className="truncate text-sm font-semibold text-white/65">@{v.user.username}</p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Closed: blurred thumbnail + centered avatar. scale hides
                                            the blur's transparent edge against the panel border. */}
                                        {v.thumbnailUrl && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={v.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 size-full scale-110 object-cover blur-xl" />
                                        )}
                                        <div className="absolute inset-0 bg-black/40" />
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

export function HomeCarouselSkeleton() {
    // Mirrors the carousel's resting state: the wide active panel centered with
    // narrow peeks flanking it. Same panel dimensions/structure as the live
    // version (avatar on closed panels, avatar + caption on the active one),
    // minus the scrolling, edge arrows, and interaction.
    return (
        <div className="relative w-full overflow-hidden">
            <div className="flex h-[clamp(260px,23vw,360px)] justify-center gap-4 px-[3%]">
                <ClosedPanelSkeleton />
                <ClosedPanelSkeleton />
                {/* Active panel: blurred thumbnail with avatar + caption at the bottom. */}
                <div className="relative h-full w-[min(760px,52vw)] shrink-0 overflow-hidden rounded-[20px] bg-muted">
                    <Skeleton className="absolute inset-0 size-full rounded-none" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-6">
                        <Skeleton className="size-10 shrink-0 rounded-full bg-zinc-700" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <Skeleton className="h-5 w-1/2 bg-zinc-700" />
                            <Skeleton className="h-3.5 w-1/4 bg-zinc-700" />
                        </div>
                    </div>
                </div>
                <ClosedPanelSkeleton />
                <ClosedPanelSkeleton />
            </div>
        </div>
    );
}

function ClosedPanelSkeleton() {
    // Closed panel: blurred thumbnail with the creator avatar centered.
    return (
        <div className="relative h-full w-[116px] shrink-0 overflow-hidden rounded-[20px] bg-muted">
            <Skeleton className="absolute inset-0 size-full rounded-none" />
            <div className="absolute inset-0 flex items-center justify-center">
                <Skeleton className="size-14 rounded-full bg-zinc-700" />
            </div>
        </div>
    );
}
