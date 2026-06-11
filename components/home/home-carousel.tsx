"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

// Coverflow/accordion hero per desktopdesigns/homecarousel.svg: one wide
// active panel (771×341, r=50) flanked by thin peek panels (119×341, r=20)
// with 20px gaps, the row slightly wider than the viewport so the outer
// panels bleed ~3% off each edge. Hovering a panel expands it; the middle
// one is active by default.
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

    return (
        <div className="relative w-full overflow-hidden">
            <div className="-ml-[3%] flex h-[clamp(260px,23vw,360px)] w-[106%] gap-5">
                {videos.map((v, i) => {
                    const isActive = i === active;
                    return (
                        <Link
                            key={v.id}
                            href={watchHref(v)}
                            onMouseEnter={() => setActive(i)}
                            onFocus={() => setActive(i)}
                            aria-label={v.title}
                            style={{ flexGrow: isActive ? 6.5 : 1, transition: `flex-grow 0.6s ${EASE}, border-radius 0.6s ${EASE}` }}
                            className={`group relative block h-full basis-0 overflow-hidden bg-muted outline-none ${
                                isActive ? "rounded-[50px]" : "rounded-[20px]"
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
        </div>
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
