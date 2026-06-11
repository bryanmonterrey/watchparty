"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Hero strip per desktopdesigns/homecarousel.svg, scaled to 24 videos.
//
// Layout: a horizontally-scrollable row of fixed-width peek panels and one
// wide active panel. Pure CSS — the active panel animates its `width` and the
// strip uses native smooth scrolling, so nothing runs on the JS thread per
// frame (this is why it feels snappier than the old GSAP flex-grow tween).
//
// Interaction:
//   • Click a closed panel  → it expands (becomes active) and centers.
//   • Click the open panel   → navigates to its watch page.
//   • Arrows                 → SCROLL the strip one video left/right. They do
//                              NOT open anything; opening is click-only.
//
// Closed panel: blurred thumbnail with the creator avatar centered.
// Open panel:   the video autoplays (muted, looped) with a caption.

const PEEK_W = 116; // px — closed panel width
const GAP = 16; // px — matches gap-4

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
    // Default-active the middle panel, matching the SVG's centered hero.
    const [active, setActive] = useState(() => Math.floor(videos.length / 2));
    const scrollerRef = useRef<HTMLDivElement>(null);
    const panelRefs = useRef<(HTMLAnchorElement | null)[]>([]);
    const didMount = useRef(false);

    // Bring the active panel to center — instantly on mount, smoothly after.
    useEffect(() => {
        panelRefs.current[active]?.scrollIntoView({
            behavior: didMount.current ? "smooth" : "auto",
            inline: "center",
            block: "nearest",
        });
        didMount.current = true;
    }, [active]);

    const scrollByVideo = (dir: -1 | 1) =>
        scrollerRef.current?.scrollBy({ left: dir * (PEEK_W + GAP), behavior: "smooth" });

    // Click-drag to scroll (mouse/pen only — touch keeps native momentum
    // scrolling). `moved` suppresses the panel click that would otherwise fire
    // at the end of a drag.
    const drag = useRef({ on: false, startX: 0, startScroll: 0, moved: false });
    const onPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === "touch" || !scrollerRef.current) return;
        drag.current = { on: true, startX: e.clientX, startScroll: scrollerRef.current.scrollLeft, moved: false };
        scrollerRef.current.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const el = scrollerRef.current;
        if (!el || !drag.current.on) return;
        const dx = e.clientX - drag.current.startX;
        if (Math.abs(dx) > 4) drag.current.moved = true;
        el.scrollLeft = drag.current.startScroll - dx;
    };
    const onPointerUp = (e: React.PointerEvent) => {
        drag.current.on = false;
        scrollerRef.current?.releasePointerCapture(e.pointerId);
    };

    if (videos.length === 0) return null;

    return (
        <div className="group/carousel relative w-full">
            <div
                ref={scrollerRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onDragStart={(e) => e.preventDefault()}
                className="hidden-scrollbar flex h-[clamp(260px,23vw,360px)] cursor-grab gap-4 overflow-x-auto px-[3%] select-none active:cursor-grabbing"
            >
                {videos.map((v, i) => {
                    const isActive = i === active;
                    return (
                        <Link
                            key={v.id}
                            ref={(el) => { panelRefs.current[i] = el; }}
                            href={watchHref(v)}
                            // Click a closed panel to open it (no navigation);
                            // click the open one to actually go watch.
                            onClick={(e) => {
                                // Swallow the click that ends a drag (so dragging
                                // never opens a panel or navigates).
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
                                    {v.videoUrl ? (
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
                })}
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
    return (
        <div className="relative w-full overflow-hidden">
            <div className="flex h-[clamp(260px,23vw,360px)] gap-4 px-[3%]">
                <Skeleton className="h-full w-[116px] shrink-0 rounded-[20px]" />
                <Skeleton className="h-full w-[116px] shrink-0 rounded-[20px]" />
                <Skeleton className="h-full w-[min(760px,52vw)] shrink-0 rounded-[20px]" />
                <Skeleton className="h-full w-[116px] shrink-0 rounded-[20px]" />
                <Skeleton className="h-full w-[116px] shrink-0 rounded-[20px]" />
            </div>
        </div>
    );
}
