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

    return (
        <div className="flex flex-col w-full pt-16">
            {/* Mobile search pill (desktop searches from the header) */}
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
                    <h1 className="text-xl font-bold text-white px-6 pt-4 pb-2">
                        Results for &ldquo;{debouncedQuery}&rdquo;
                    </h1>

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
                    ) : users.length === 0 && postItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <SearchIcon className="w-6 h-6 text-zinc-600" />
                            <p className="text-sm text-zinc-500">No results for &ldquo;{debouncedQuery}&rdquo;</p>
                        </div>
                    ) : (
                        <>
                            {users.length > 0 && (
                                <div>
                                    <p className="px-6 pt-2 pb-1 text-xs font-semibold text-zinc-500 uppercase tracking-wide">People</p>
                                    {users.map(u => (
                                        <UserRow key={u.id} user={u} />
                                    ))}
                                </div>
                            )}

                            {postItems.length > 0 && (
                                <div className={users.length > 0 ? "mt-2 border-t border-white/5" : ""}>
                                    <p className="px-6 pt-3 pb-1 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Posts</p>
                                    {postItems.map(p => (
                                        <PostCard key={p.id} post={p as any} />
                                    ))}
                                    {hasNextPage && (
                                        <button
                                            onClick={() => fetchNextPage()}
                                            className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                                        >
                                            Load more
                                        </button>
                                    )}
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
