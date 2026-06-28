"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryCard } from "./category-card";
import type { HomeCategory } from "@/lib/data/home-categories";

const STEP = 60;

// Incremental reveal for the full catalog (~600 cards) so the page doesn't
// mount everything at once. An IntersectionObserver sentinel (not a scroll
// listener) loads the next batch ~600px before it enters view; the button is a
// keyboard/no-JS-IO fallback.
export function CategoryGrid({ categories }: { categories: HomeCategory[] }) {
    const [count, setCount] = useState(STEP);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (count >= categories.length) return;
        const el = sentinelRef.current;
        if (!el) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setCount((c) => Math.min(c + STEP, categories.length));
                }
            },
            { rootMargin: "600px" }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [count, categories.length]);

    const visible = categories.slice(0, count);

    return (
        <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {visible.map((c, i) => (
                    <CategoryCard key={c.slug} c={c} index={i} count={visible.length} className="w-full shrink" />
                ))}
            </div>
            {count < categories.length && (
                <div ref={sentinelRef} className="flex justify-center py-10">
                    <button
                        onClick={() => setCount((c) => Math.min(c + STEP, categories.length))}
                        className="rounded-full bg-card px-5 py-2 text-sm font-semibold ring-1 ring-border transition-colors hover:bg-muted"
                    >
                        Load more
                    </button>
                </div>
            )}
        </>
    );
}
