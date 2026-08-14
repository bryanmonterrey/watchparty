"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useQueryState } from "nuqs";
import { searchParams } from "@/lib/searchParams";
import { SearchIcon } from "@/components/icons";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/browse/post-card";
import Link from "next/link";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { HOME_CATEGORIES } from "@/lib/data/home-categories";
import { CategoryCard } from "@/components/categories/category-card";
import { LoadMore } from "@/components/interior/load-more";

// Discovery (Live + categories) shown while the query is empty. Lazy + ssr:false
// so its feed queries aren't part of the initial search payload; the inline
// object literal is required (Turbopack statically analyzes dynamic() options).
const SearchLanding = dynamic(() => import("@/components/search/search-landing").then(m => m.SearchLanding), { ssr: false });

// Port of sidebar's (browse)/search/page.tsx — header-driven search results
// (people + posts), reading ?q= from the URL. Mobile additions per the design:
// an in-page search pill (desktop types in the header's GlobalSearch instead)
// and a Live/Categories discovery landing while the query is empty.

export default function SearchPage() {
    const [q, setQ] = useQueryState("q", searchParams.q);
    const [inputValue, setInputValue] = useState(q ?? "");
    // Single debounce off the live input — debouncing q (already written 350ms
    // after typing) stacked two delays into ~700ms before the query fired. The
    // URL write below still debounces, but in parallel with the query now.
    const debouncedQuery = useDebounce(inputValue, 350);

    useEffect(() => setInputValue(q ?? ""), [q]);
    useEffect(() => {
        const t = setTimeout(() => {
            if (inputValue !== (q ?? "")) setQ(inputValue || null);
        }, 350);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inputValue]);

    const enabled = debouncedQuery.length >= 2;

    const { data: usersData, isLoading: usersLoading } = trpc.user.search.useQuery(
        { query: debouncedQuery, limit: 20 },
        { enabled }
    );
    const { data: postsData, isLoading: postsLoading, fetchNextPage, hasNextPage } =
        trpc.content.searchPosts.useInfiniteQuery(
            { query: debouncedQuery, limit: 20 },
            { getNextPageParam: (last) => last.nextCursor, enabled }
        );

    const users = usersData?.users ?? [];
    const postItems = postsData?.pages.flatMap(p => (p as any).posts) ?? [];
    const isLoading = usersLoading || postsLoading;

    // Categories are matched client-side against the static browse list (title
    // or tags contain the query) — no extra request.
    const matchedCategories = enabled
        ? HOME_CATEGORIES.filter((c) => {
            const needle = debouncedQuery.toLowerCase();
            return (
                c.title.toLowerCase().includes(needle) ||
                c.tags.some((t) => t.toLowerCase().includes(needle))
            );
        })
        : [];

    // Result tab filter. "all" shows every non-empty section; the rest scope to
    // one. Reset to "all" when the query changes (adjust-during-render pattern,
    // so no effect is needed).
    const [tab, setTab] = useState<"all" | "people" | "videos" | "media" | "posts" | "categories">("all");
    const [tabQuery, setTabQuery] = useState(debouncedQuery);
    if (tabQuery !== debouncedQuery) {
        setTabQuery(debouncedQuery);
        setTab("all");
    }

    // Classify results by content type for the Videos / Media / Posts tabs.
    // Reposts carry their content on the original, so fall back to orig fields.
    const hasVideo = (p: { videoUrl?: string | null; origVideoUrl?: string | null }) =>
        !!(p.videoUrl ?? p.origVideoUrl);
    const hasMedia = (p: { media?: unknown; origMedia?: unknown; imageUrl?: string | null; origImageUrl?: string | null }) => {
        const media = p.media ?? p.origMedia;
        const image = p.imageUrl ?? p.origImageUrl;
        return (Array.isArray(media) && media.length > 0) || !!image;
    };
    const videos = postItems.filter(hasVideo);
    const mediaPosts = postItems.filter((p) => !hasVideo(p) && hasMedia(p));
    const textPosts = postItems.filter((p) => !hasVideo(p) && !hasMedia(p));

    const postSubset =
        tab === "videos" ? videos :
        tab === "media" ? mediaPosts :
        tab === "posts" ? textPosts :
        postItems;
    const postSectionLabel = tab === "videos" ? "Videos" : tab === "media" ? "Media" : "Posts";

    const showPeople = (tab === "all" || tab === "people") && users.length > 0;
    const showPosts = (tab === "all" || tab === "videos" || tab === "media" || tab === "posts") && postSubset.length > 0;
    const showCategories = (tab === "all" || tab === "categories") && matchedCategories.length > 0;
    const nothing = users.length === 0 && postItems.length === 0 && matchedCategories.length === 0;

    return (
        <div className="flex flex-col w-full pt-16">
            {/* Mobile search pill (desktop searches live from the header bar). */}
            <div className="px-5 pb-6 pt-2 md:hidden">
                <label className="flex h-12 items-center gap-3 rounded-full bg-card px-4 ring-1 ring-border">
                    <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
                    <input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Search"
                        className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    />
                </label>
            </div>

            {debouncedQuery.length >= 2 ? (
                <div className="w-full">
                    <h1 className="text-xl font-bold text-foreground px-6 pt-4 pb-2">
                        Results for &ldquo;{debouncedQuery}&rdquo;
                    </h1>

                    {/* Result tabs — counts come from the data already fetched.
                        Horizontally scrollable so the six tabs don't wrap on mobile. */}
                    <div className="hidden-scrollbar flex gap-1 overflow-x-auto border-b border-border px-4">
                        {([
                            ["all", "All", users.length + postItems.length + matchedCategories.length],
                            ["people", "People", users.length],
                            ["videos", "Videos", videos.length],
                            ["media", "Media", mediaPosts.length],
                            ["posts", "Posts", textPosts.length],
                            ["categories", "Categories", matchedCategories.length],
                        ] as const).map(([key, label, count]) => (
                            <button
                                key={key}
                                onClick={() => setTab(key)}
                                className={cn(
                                    "relative shrink-0 px-3 py-3 text-sm font-semibold transition-colors",
                                    tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {label}
                                {key !== "all" && count > 0 && (
                                    <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
                                )}
                                {tab === key && (
                                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />
                                )}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div className="px-6 py-4 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex gap-3">
                                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : nothing ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <SearchIcon className="w-6 h-6 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">No results for &ldquo;{debouncedQuery}&rdquo;</p>
                        </div>
                    ) : (
                        <>
                            {showCategories && (
                                <div className="px-6 pt-4">
                                    <p className="pb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories</p>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                                        {matchedCategories.map((c, i) => (
                                            <CategoryCard key={c.slug} c={c} index={i} count={matchedCategories.length} className="w-full shrink" />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {showPeople && (
                                <div className={showCategories ? "mt-4 border-t border-border" : ""}>
                                    <p className="px-6 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</p>
                                    {users.map(u => (
                                        <UserRow key={u.id} user={u} />
                                    ))}
                                </div>
                            )}

                            {showPosts && (
                                <div className={showPeople || showCategories ? "mt-2 border-t border-border" : ""}>
                                    <p className="px-6 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{postSectionLabel}</p>
                                    {postSubset.map(p => (
                                        <PostCard key={p.id} post={p as any} />
                                    ))}
                                    {(tab === "all" || tab === "videos" || tab === "media" || tab === "posts") && (
                                        <LoadMore
                                            onLoad={() => fetchNextPage()}
                                            hasMore={!!hasNextPage}
                                            className="py-3"
                                            labels={{ end: "No more results" }}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Scoped tab with no matches in that section. */}
                            {!showPeople && !showPosts && !showCategories && (
                                <div className="flex flex-col items-center justify-center py-16 gap-2">
                                    <p className="text-sm text-muted-foreground">No {tab} for &ldquo;{debouncedQuery}&rdquo;</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            ) : (
                <SearchLanding />
            )}
        </div>
    );
}

function UserRow({ user }: { user: { id: string; name: string | null; username: string | null; avatar_url: string | null } }) {
    return (
        <Link
            href={`/${user.username}`}
            className="flex items-center gap-3 px-6 py-3 hover:bg-white/5 transition-colors"
        >
            <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt={user.name ?? ""} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm font-bold">
                        {(user.name ?? user.username ?? "?")[0]?.toUpperCase()}
                    </div>
                )}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100 truncate">{user.name || user.username}</p>
                <p className="text-xs text-zinc-500 truncate">@{user.username}</p>
            </div>
        </Link>
    );
}
