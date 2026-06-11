"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Coverflow/accordion hero per desktopdesigns/homecarousel.svg: one wide
// active panel (771×341, r=50) flanked by thin peek panels (119×341, r=20)
// with 20px gaps, the row slightly wider than the viewport so the outer
// panels bleed ~3% off each edge. The middle panel is active by default.
//
// Interaction: a peek panel must be CLICKED to expand (hover does nothing);
// clicking the already-active panel navigates to its watch page. Netflix-style
// edge arrows step the active panel and fade in only while the carousel is
// hovered.
//
// Widths are flex ratios (active 6.5 : peek 1 ≈ the 771:119 of the SVG) so
// the whole thing scales with the container instead of pinning to 1512.

interface CarouselVideo {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    user: { username: string | null; avatar_url: string | null };
}

const EASE = "cubic-bezier(0.32,0.72,0,1)";

function watchHref(v: CarouselVideo) {
    return `/${v.user.username}/${v.id}`;
}

export function HomeCarousel({ videos }: { videos: CarouselVideo[] }) {
    // Default-active the middle panel, matching the SVG's centered hero.
    const [active, setActive] = useState(() => Math.floor(videos.length / 2));

    if (videos.length === 0) return null;

    const step = (dir: -1 | 1) =>
        setActive((a) => Math.min(videos.length - 1, Math.max(0, a + dir)));

    return (
        <div className="group/carousel relative w-full overflow-hidden">
            <div className="-ml-[3%] flex h-[clamp(260px,23vw,360px)] w-[106%] gap-5">
                {videos.map((v, i) => {
                    const isActive = i === active;
                    return (
                        <Link
                            key={v.id}
                            href={watchHref(v)}
                            // Click a closed panel to open it (no navigation);
                            // click the open one to actually go watch.
                            onClick={(e) => {
                                if (!isActive) {
                                    e.preventDefault();
                                    setActive(i);
                                }
                            }}
                            aria-label={isActive ? v.title : `Open ${v.title}`}
                            style={{ flexGrow: isActive ? 6.5 : 1, transition: `flex-grow 0.6s ${EASE}, border-radius 0.6s ${EASE}` }}
                            className={`group/panel relative block h-full basis-0 overflow-hidden bg-muted outline-none ${
                                isActive ? "rounded-[50px]" : "cursor-pointer rounded-[20px]"
                            }`}
                        >
                            {v.thumbnailUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={v.thumbnailUrl}
                                    alt=""
                                    className="absolute inset-0 size-full object-cover"
                                    loading={i <= 3 ? "eager" : "lazy"}
                                />
                            )}

                            {/* Scrim: heavy flat dark on peeks (the SVG's #151313
                                strips), a bottom gradient on the active panel so
                                its caption stays legible. */}
                            <div
                                className="absolute inset-0 transition-colors duration-500"
                                style={{
                                    background: isActive
                                        ? "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.15) 38%, transparent 62%)"
                                        : "rgba(10,9,9,0.62)",
                                }}
                            />

                            {/* Caption — only the active panel is wide enough to
                                show it; fades/slides in as the panel expands. */}
                            <div
                                className={`absolute inset-x-0 bottom-0 flex items-end gap-3 p-6 transition-all duration-500 ${
                                    isActive ? "translate-y-0 opacity-100 delay-100" : "pointer-events-none translate-y-2 opacity-0"
                                }`}
                            >
                                <div className="size-10 shrink-0 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/15">
                                    {v.user.avatar_url && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={v.user.avatar_url} alt="" className="size-full object-cover" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xl font-extrabold tracking-tight text-white">
                                        {v.title}
                                    </p>
                                    {v.user.username && (
                                        <p className="truncate text-sm font-semibold text-white/65">
                                            @{v.user.username}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Netflix-style edge controls: black rectangle that fades in on
                carousel hover, white chevron that lifts on its own hover. The
                boundary arrow stays hidden (can't step past the ends). */}
            <CarouselArrow side="left" onClick={() => step(-1)} disabled={active === 0} />
            <CarouselArrow side="right" onClick={() => step(1)} disabled={active === videos.length - 1} />
        </div>
    );
}

function CarouselArrow({ side, onClick, disabled }: { side: "left" | "right"; onClick: () => void; disabled: boolean }) {
    const Icon = side === "left" ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={side === "left" ? "Previous" : "Next"}
            className={`group/arrow absolute inset-y-0 z-20 flex w-[68px] items-center transition-opacity duration-300 opacity-0 group-hover/carousel:opacity-100 disabled:pointer-events-none disabled:!opacity-0 ${
                side === "left"
                    ? "left-0 justify-start bg-gradient-to-r from-black/90 via-black/45 to-transparent pl-3"
                    : "right-0 justify-end bg-gradient-to-l from-black/90 via-black/45 to-transparent pr-3"
            }`}
        >
            <Icon className="size-9 text-white drop-shadow-lg transition-transform duration-200 group-hover/arrow:scale-110" strokeWidth={2.5} />
        </button>
    );
}

export function HomeCarouselSkeleton() {
    return (
        <div className="relative w-full overflow-hidden">
            <div className="-ml-[3%] flex h-[clamp(260px,23vw,360px)] w-[106%] gap-5">
                <Skeleton className="h-full basis-0 grow rounded-[20px]" />
                <Skeleton className="h-full basis-0 grow rounded-[20px]" />
                <Skeleton className="h-full shrink-0 grow-[6.5] basis-0 rounded-[50px]" />
                <Skeleton className="h-full basis-0 grow rounded-[20px]" />
                <Skeleton className="h-full basis-0 grow rounded-[20px]" />
            </div>
        </div>
    );
}
