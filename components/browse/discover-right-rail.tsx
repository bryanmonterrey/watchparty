"use client";

import { MoreHorizontal, BadgeCheck } from "lucide-react";
import { NEWS } from "./trending-sidebar";

// Right column per desktopdesigns/discoverupdate.svg (1512 frame):
// three white cards, x1112 w350, heights 229/360/360, radius 25, no internal
// borders. Mock data mirrors the design's content shape until the live/news
// procedures get wired (same approach as the NEWS list itself).

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
        <section className={`overflow-hidden rounded-[25px] bg-card ${className ?? ""}`}>
            <h2 className="px-6 pb-2 pt-5 text-[24px] font-extrabold tracking-tight">{title}</h2>
            <div className="hidden-scrollbar h-[calc(100%-4.25rem)] pb-4">
                {children}
            </div>
        </section>
    );
}

// ── Live on watchparty ───────────────────────────────────────────────────────
const LIVE_NOW = [
    {
        host: "TMX",
        verb: "is hosting",
        title: "TMX Live - Streaming From The Newsroom!",
        count: "+3.4K",
        kind: "stream" as const,
    },
    {
        host: "inferno",
        verb: "is listening",
        title: "Most insane conversation EVER. (crypto [gone …",
        count: "+75",
        kind: "space" as const,
    },
];

function LiveRow({ host, verb, title, count, kind }: (typeof LIVE_NOW)[number]) {
    return (
        <button className="flex w-full items-start gap-3 px-6 py-2 text-left transition-colors hover:bg-foreground/[0.03]">
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[15px]">
                    <span className="size-[17px] shrink-0 rounded-[2px] bg-muted" />
                    <span className="ml-1 font-extrabold">{host}</span>
                    <BadgeCheck className="size-4 shrink-0 fill-amber-400 text-card" />
                    <span className="font-medium">{verb}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-[17px] font-extrabold leading-snug">{title}</p>
            </div>
            {kind === "stream" ? (
                <span className="mt-5 flex shrink-0 items-center gap-1 rounded-[2px] border border-red1 px-1 py-0.5 text-[14px] font-bold">
                    <span className="size-[26px] rounded-[2px] bg-muted" />
                    {count}
                </span>
            ) : (
                <span className="mt-5 flex shrink-0 items-center rounded-full border-2 border-[#7856FF] py-0.5 pl-1.5 pr-2 text-[14px] font-bold">
                    <span className="flex -space-x-2">
                        {[0, 1, 2].map((i) => (
                            <span key={i} className="size-6 rounded-full bg-muted ring-2 ring-card" />
                        ))}
                    </span>
                    <span className="ml-1">{count}</span>
                </span>
            )}
        </button>
    );
}

// ── Today's News ─────────────────────────────────────────────────────────────
function NewsRow({ headline, category, posts }: { headline: string; category: string; posts: string }) {
    return (
        <button className="block w-full px-6 py-3 text-left transition-colors hover:bg-foreground/[0.03]">
            <p className="line-clamp-2 text-[17px] font-extrabold leading-snug">{headline}</p>
            <div className="mt-1.5 flex items-center gap-2">
                <span className="flex -space-x-1.5">
                    {[0, 1, 2].map((i) => (
                        <span key={i} className="size-5 rounded-full bg-muted ring-2 ring-card" />
                    ))}
                </span>
                <span className="text-[15px] text-muted-foreground">
                    Trending now · {category} · {posts} posts
                </span>
            </div>
        </button>
    );
}

// ── What's happening ─────────────────────────────────────────────────────────
const HAPPENING = [
    { meta: null, topic: "The Furious", sub: "Only In Theaters Friday.", promoted: "lionsgate" },
    { meta: "Entertainment · Trending", topic: "Glenn Close", sub: null, promoted: null },
    { meta: "Trending in United States", topic: "University of Michigan", sub: null, promoted: null },
    { meta: "Sports · Trending", topic: "Champions League", sub: null, promoted: null },
];

function HappeningRow({ meta, topic, sub, promoted }: (typeof HAPPENING)[number]) {
    return (
        <button className="flex w-full items-start justify-between gap-3 px-6 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]">
            <div className="min-w-0">
                {meta && <p className="text-[14px] text-muted-foreground">{meta}</p>}
                <p className="text-[16px] font-bold leading-snug">{topic}</p>
                {sub && <p className="text-[15px] text-muted-foreground">{sub}</p>}
                {promoted && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-muted-foreground">
                        <span className="size-2.5 bg-[#60707B]" /> Promoted by {promoted}
                    </p>
                )}
            </div>
            <MoreHorizontal className="mt-1 size-5 shrink-0 text-muted-foreground" />
        </button>
    );
}

export function DiscoverRightRail() {
    return (
        <div className="flex w-full flex-col gap-[18px] pb-8">
            <RailCard title="Live on watchparty" className="h-fit">
                {LIVE_NOW.map((item) => (
                    <LiveRow key={item.host} {...item} />
                ))}
            </RailCard>

            <RailCard title="Today's News" className="h-fit">
                {NEWS.slice(0, 3).map((item, i) => (
                    <NewsRow key={i} {...item} />
                ))}
            </RailCard>

            <RailCard title="What's happening" className="h-fit">
                {HAPPENING.map((item) => (
                    <HappeningRow key={item.topic} {...item} />
                ))}
            </RailCard>

            <div className="h-[50svh] w-full shrink-0 bg-transparent" />
        </div>
    );
}
