"use client";

import { cn } from "@/lib/utils";

// OpenSea-style filter rail for the profile Posts tab (user pointed at
// OpenSea's Items filters, 2026-07-22 — ours sits on the RIGHT). Desktop
// renders sections of pill options; mobile gets the same pills as a
// horizontal row above the feed.

export type PostTypeFilter = "all" | "text" | "media" | "polls" | "articles";
export type PostShowFilter = "all" | "posts" | "replies";

const TYPE_OPTIONS: { value: PostTypeFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "text", label: "Text" },
    { value: "media", label: "Media" },
    { value: "polls", label: "Polls" },
    { value: "articles", label: "Articles" },
];

const SHOW_OPTIONS: { value: PostShowFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "posts", label: "Posts" },
    { value: "replies", label: "Replies" },
];

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "h-9 cursor-pointer rounded-full px-4 text-sm font-bold transition-colors",
                active
                    ? "bg-white text-black"
                    : "bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-white",
            )}
        >
            {label}
        </button>
    );
}

export function PostsFilterRail({ type, show, onTypeChange, onShowChange }: {
    type: PostTypeFilter;
    show: PostShowFilter;
    onTypeChange: (t: PostTypeFilter) => void;
    onShowChange: (s: PostShowFilter) => void;
}) {
    return (
        <aside className="sticky top-24 hidden w-[240px] shrink-0 flex-col gap-8 self-start lg:flex">
            <div className="flex flex-col gap-3">
                <h4 className="text-sm font-black uppercase tracking-[0.15em] text-zinc-500">Type</h4>
                <div className="flex flex-wrap gap-2">
                    {TYPE_OPTIONS.map((o) => (
                        <FilterPill key={o.value} label={o.label} active={type === o.value} onClick={() => onTypeChange(o.value)} />
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <h4 className="text-sm font-black uppercase tracking-[0.15em] text-zinc-500">Show</h4>
                <div className="flex flex-wrap gap-2">
                    {SHOW_OPTIONS.map((o) => (
                        <FilterPill key={o.value} label={o.label} active={show === o.value} onClick={() => onShowChange(o.value)} />
                    ))}
                </div>
            </div>
        </aside>
    );
}

/** Mobile fallback: the Type pills as one horizontal scroll row above the feed. */
export function PostsFilterRow({ type, onTypeChange }: {
    type: PostTypeFilter;
    onTypeChange: (t: PostTypeFilter) => void;
}) {
    return (
        <div className="mb-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
            {TYPE_OPTIONS.map((o) => (
                <FilterPill key={o.value} label={o.label} active={type === o.value} onClick={() => onTypeChange(o.value)} />
            ))}
        </div>
    );
}
