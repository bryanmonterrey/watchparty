"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { staggerPulse } from "@/lib/skeleton-stagger";
import type { HomeCategory } from "@/lib/data/home-categories";

// Shared category tile — the canonical look lifted from the home page's
// Categories row (aspect-[2/3] box art, extrabold title, capped tag pills).
// Used by the home carousel (fixed width), the /category index, and the
// search landing (grid). Pass `index`/`count` to drive the staggered skeleton
// pulse while the art loads; pass `className` to size it (carousel = fixed
// width + shrink-0; grid = w-full).
export function CategoryCard({
    c,
    index = 0,
    count = 1,
    className,
}: {
    c: HomeCategory;
    index?: number;
    count?: number;
    className?: string;
}) {
    const [loaded, setLoaded] = useState(false);
    return (
        <Link href={c.slug} className={cn("group block w-36 shrink-0", className)}>
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
                <p className="truncate text-sm font-extrabold text-foreground">{c.title}</p>
                {c.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.tags.slice(0, 2).map((t) => (
                            <span
                                key={t}
                                className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
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
