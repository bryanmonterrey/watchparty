"use client";

import { NEWS } from "./trending-sidebar";

// Borderless, theme-aware trend row (the ported NewsItem carries sidebar's
// dark-theme row borders/zinc colors — the design has none of that).
function TrendItem({ headline, category, posts }: { headline: string; category: string; posts: string }) {
    return (
        <button className="flex w-full items-start gap-3 px-6 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]">
            <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
                    {headline}
                </p>
                <span className="mt-1 text-[12px] text-muted-foreground">
                    Trending now · {category} · {posts} posts
                </span>
            </div>
            <div className="mt-0.5 size-14 shrink-0 rounded-xl bg-foreground/[0.07]" />
        </button>
    );
}

// Right column of the discover 3-col layout, per the updated
// desktopdesigns/discoverlanding.svg: three stacked rounded cards (short /
// tall / rest) instead of the old full-height bordered news list. Content is
// the same trending data, split across the cards.
// Card geometry from the Figma rects (1512 frame): 350 wide, heights
// 229 / 360 / 360, radius 39, ~18px vertical gaps, 50px to the page edge.
function RailCard({
    title,
    children,
    className,
}: {
    title: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={`overflow-hidden rounded-[39px] bg-muted/60 ${className ?? ""}`}>
            <h2 className="px-6 pb-1 pt-5 text-[19px] font-extrabold tracking-tight">{title}</h2>
            <div className="hidden-scrollbar h-[calc(100%-3.75rem)] overflow-y-auto">
                {children}
            </div>
        </section>
    );
}

export function DiscoverRightRail() {
    return (
        <div className="flex w-full max-w-[350px] flex-col gap-[18px] pb-8">
            <RailCard title="Trending" className="h-[229px]">
                {NEWS.slice(0, 5).map((item, i) => (
                    <TrendItem key={i} {...item} />
                ))}
            </RailCard>

            <RailCard title="What's happening" className="h-[360px]">
                {NEWS.slice(5, 14).map((item, i) => (
                    <TrendItem key={i} {...item} />
                ))}
            </RailCard>

            <RailCard title="More for you" className="h-[360px]">
                {NEWS.slice(14, 26).map((item, i) => (
                    <TrendItem key={i} {...item} />
                ))}
            </RailCard>
        </div>
    );
}
