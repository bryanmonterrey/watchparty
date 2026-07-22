"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon, ArrowDown01Icon, Sorting01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";

// The profile Posts-tab control surface, modeled on OpenSea's items page
// (user ref 2026-07-22) in watchparty's language: a toolbar (result count +
// post search + sort) over the feed, and a sticky rail of collapsible filter
// sections with live per-filter counts and a reset row. Rail sits on the
// RIGHT (owner call); mobile gets the Type pills as a horizontal row.

export type PostTypeFilter = "all" | "text" | "media" | "polls" | "articles";
export type PostShowFilter = "all" | "posts" | "replies";
export type PostSort = "newest" | "oldest" | "top" | "views";

export type PostFilterCounts = {
    all: number; text: number; media: number; polls: number; articles: number;
    posts: number; replies: number;
};

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

const SORT_OPTIONS: { value: PostSort; label: string }[] = [
    { value: "newest", label: "Newest" },
    { value: "oldest", label: "Oldest" },
    { value: "top", label: "Most liked" },
    { value: "views", label: "Most viewed" },
];

// ── Toolbar ────────────────────────────────────────────────────────────────

export function PostsToolbar({ total, search, onSearchChange, sort, onSortChange }: {
    total: number | undefined;
    search: string;
    onSearchChange: (v: string) => void;
    sort: PostSort;
    onSortChange: (s: PostSort) => void;
}) {
    const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Newest";
    return (
        <div className="mb-5 flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
                <HugeiconsIcon
                    icon={Search01Icon}
                    className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
                    strokeWidth={2}
                />
                <input
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search posts"
                    className="h-11 w-full rounded-full bg-white/5 pl-11 pr-10 text-sm font-semibold text-white placeholder:text-zinc-500 ring-1 ring-white/10 outline-none transition-shadow focus:ring-white/25"
                />
                {search && (
                    <button
                        onClick={() => onSearchChange("")}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2.5} />
                    </button>
                )}
            </div>
            <GooDropdown
                width={200}
                align="end"
                triggerAriaLabel="Sort posts"
                triggerClassName="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-white/5 px-4 text-sm font-bold text-zinc-200 ring-1 ring-white/10 transition-colors hover:text-white"
                trigger={
                    <>
                        <HugeiconsIcon icon={Sorting01Icon} className="size-4" strokeWidth={2} />
                        <span>{sortLabel}</span>
                        <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-zinc-500" strokeWidth={2.5} />
                    </>
                }
                items={SORT_OPTIONS.map((o) => ({
                    key: o.value,
                    onClick: () => onSortChange(o.value),
                    className: cn(
                        "gap-3 px-4 rounded-full cursor-pointer text-sm font-bold",
                        o.value === sort ? "text-white" : "text-zinc-400 hover:text-white",
                    ),
                    label: (
                        <span className="flex w-full items-center justify-between">
                            {o.label}
                            {o.value === sort && <HugeiconsIcon icon={Tick02Icon} className="size-4" strokeWidth={3} />}
                        </span>
                    ),
                }))}
            />
            {typeof total === "number" && (
                <span className="hidden shrink-0 text-sm font-bold tabular-nums text-zinc-500 sm:block">
                    {total.toLocaleString()} {total === 1 ? "post" : "posts"}
                </span>
            )}
        </div>
    );
}

// ── Rail ───────────────────────────────────────────────────────────────────

function FilterSection({ title, children, defaultOpen = true }: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="flex flex-col">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex h-11 w-full cursor-pointer items-center justify-between px-1 text-sm font-black uppercase tracking-[0.15em] text-zinc-400 transition-colors hover:text-white"
            >
                {title}
                <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className={cn("size-4 transition-transform duration-300", open ? "" : "-rotate-90")}
                    strokeWidth={2.5}
                />
            </button>
            {/* grid-rows collapse: compositor-cheap, no height animation hacks */}
            <div className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                    {children}
                </div>
            </div>
        </div>
    );
}

function FilterOption({ label, count, active, onClick }: {
    label: string;
    count?: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex h-10 w-full cursor-pointer items-center justify-between rounded-full px-4 text-sm font-bold transition-colors",
                active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white",
            )}
        >
            <span className="flex items-center gap-2.5">
                {label}
            </span>
            <span className="flex items-center gap-2">
                {typeof count === "number" && (
                    <span className={cn("text-xs font-semibold tabular-nums", active ? "text-zinc-300" : "text-zinc-600")}>
                        {count.toLocaleString()}
                    </span>
                )}
                {active && <HugeiconsIcon icon={Tick02Icon} className="size-4" strokeWidth={3} />}
            </span>
        </button>
    );
}

export function PostsFilterRail({ userId, type, show, onTypeChange, onShowChange, onReset }: {
    userId: string;
    type: PostTypeFilter;
    show: PostShowFilter;
    onTypeChange: (t: PostTypeFilter) => void;
    onShowChange: (s: PostShowFilter) => void;
    onReset: () => void;
}) {
    const { data: counts } = trpc.content.getPostFilterCounts.useQuery({ userId });
    const filtersActive = type !== "all" || show !== "all";

    const typeCount = (v: PostTypeFilter): number | undefined =>
        counts ? counts[v] : undefined;
    const showCount = (v: PostShowFilter): number | undefined =>
        counts ? (v === "all" ? counts.all : counts[v]) : undefined;

    return (
        <aside className="sticky top-24 hidden w-[260px] shrink-0 self-start lg:block">
            <div className="flex flex-col gap-2 rounded-[20px] bg-panel p-4 ring-1 ring-panel">
                <FilterSection title="Type">
                    {TYPE_OPTIONS.map((o) => (
                        <FilterOption
                            key={o.value}
                            label={o.label}
                            count={typeCount(o.value)}
                            active={type === o.value}
                            onClick={() => onTypeChange(o.value)}
                        />
                    ))}
                </FilterSection>
                <div className="mx-1 h-px bg-white/5" />
                <FilterSection title="Show">
                    {SHOW_OPTIONS.map((o) => (
                        <FilterOption
                            key={o.value}
                            label={o.label}
                            count={showCount(o.value)}
                            active={show === o.value}
                            onClick={() => onShowChange(o.value)}
                        />
                    ))}
                </FilterSection>
                <div className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    filtersActive ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}>
                    <div className="overflow-hidden">
                        <button
                            onClick={onReset}
                            className="mt-1 flex h-11 w-full cursor-pointer items-center justify-center rounded-full bg-white text-sm font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98]"
                        >
                            Reset filters
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
}

/** Mobile fallback: the Type pills (with counts) as one horizontal scroll row. */
export function PostsFilterRow({ userId, type, onTypeChange }: {
    userId: string;
    type: PostTypeFilter;
    onTypeChange: (t: PostTypeFilter) => void;
}) {
    const { data: counts } = trpc.content.getPostFilterCounts.useQuery({ userId });
    return (
        <div className="mb-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
            {TYPE_OPTIONS.map((o) => {
                const active = type === o.value;
                const count = counts?.[o.value];
                return (
                    <button
                        key={o.value}
                        onClick={() => onTypeChange(o.value)}
                        className={cn(
                            "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors",
                            active ? "bg-white text-black" : "bg-white/5 text-zinc-400 ring-1 ring-white/10 hover:text-white",
                        )}
                    >
                        {o.label}
                        {typeof count === "number" && (
                            <span className={cn("text-xs font-semibold tabular-nums", active ? "text-zinc-600" : "text-zinc-600")}>
                                {count.toLocaleString()}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
