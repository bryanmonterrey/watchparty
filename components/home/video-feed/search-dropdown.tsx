"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { SearchIcon, CircleTimeIcon } from "@/components/icons";
import { TrendingUp, TrendingDown, FileText, X } from "lucide-react";

interface SearchDropdownProps {
    query: string;
    onClose: () => void;
    history: string[];
    onRemoveHistory: (q: string) => void;
    onSelectHistory: (q: string) => void;
    onAddHistory: (q: string) => void;
}

function formatPrice(price: number | null): string {
    if (price === null) return "—";
    if (price < 0.0001) return "< $0.0001";
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMarketCap(mc: number | null): string {
    if (mc === null) return "";
    if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(1)}B`;
    if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}M`;
    if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
    return `$${mc}`;
}

export function SearchDropdown({ query, onClose, history, onRemoveHistory, onSelectHistory, onAddHistory }: SearchDropdownProps) {
    const router = useRouter();
    const ref = useRef<HTMLDivElement>(null);
    const [debouncedQuery, setDebouncedQuery] = useState(query);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query), 200);
        return () => clearTimeout(t);
    }, [query]);

    const { data, isLoading } = trpc.content.search.useQuery(
        { query: debouncedQuery, limit: 5 },
        { enabled: debouncedQuery.length > 0 }
    );

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose]);

    // Close on ESC
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const navigate = (href: string, q: string) => {
        onAddHistory(q);
        router.push(href);
        onClose();
    };

    // Container geometry comes from docs/searchbar.svg: one panel (rx 27)
    // wrapping the search bar at a 2px inset on top/sides (bar rx 25.5,
    // 25.5 + 2 ≈ 27 — concentric), extending down to hold the results.
    // The panel renders BEHIND the bar (z-40 vs the form's z-50); pt-[58px]
    // = 2px inset + 52px bar + 4px gap before the first row.
    const isHistoryView = query.length === 0;
    const hasUsers  = (data?.users?.length  ?? 0) > 0;
    const hasTokens = (data?.tokens?.length ?? 0) > 0;
    const hasPosts  = (data?.posts?.length  ?? 0) > 0;
    const isEmpty = !isLoading && !hasUsers && !hasTokens && !hasPosts;

    // History view
    if (isHistoryView) {
        if (history.length === 0) return null;
        return (
            <div
                ref={ref}
                className="absolute -top-0.5 -left-0.5 -right-0.5 z-40 rounded-[27px] bg-input1 ring-1 ring-white/5 pt-[58px] pb-2 overflow-hidden"
            >
                <p className="px-4 pt-3 pb-1.5 text-sm font-semibold tracking-wide text-zinc-500">Recent</p>
                {history.map(item => (
                    <HistoryItem
                        key={item}
                        item={item}
                        onSelect={() => onSelectHistory(item)}
                        onRemove={() => onRemoveHistory(item)}
                    />
                ))}
            </div>
        );
    }

    return (
        <div
            ref={ref}
            className="absolute -top-0.5 -left-0.5 -right-0.5 z-40 rounded-[27px] bg-input1 ring-1 ring-white/5 pt-[58px] pb-2 overflow-hidden"
        >
            {isLoading && (
                <div className="px-4 py-3 space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full shimmer-skeleton shrink-0" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 w-1/3 rounded-full shimmer-skeleton" />
                                <div className="h-2.5 w-1/4 rounded-full shimmer-skeleton" />
                            </div>
                            <div className="h-3 w-14 rounded-full shimmer-skeleton" />
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && isEmpty && (
                <button
                    onClick={() => navigate(`/search?q=${encodeURIComponent(query)}`, query)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
                >
                    <SearchIcon className="w-5 h-5 text-zinc-400 shrink-0" />
                    <span className="text-md font-semibold text-white truncate">{debouncedQuery}</span>
                </button>
            )}

            {!isLoading && hasUsers && (
                <section>
                    <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">People</p>
                    {(data!.users ?? []).map(u => (
                        <button
                            key={u.id}
                            onClick={() => navigate(`/${u.username}`, query)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                        >
                            {u.avatar_url ? (
                                <img src={u.avatar_url} alt={u.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                                <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
                            </div>
                        </button>
                    ))}
                </section>
            )}

            {!isLoading && hasTokens && (
                <section>
                    <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Coins</p>
                    {data!.tokens.map(token => {
                        const isUp = (token.change24h ?? 0) >= 0;
                        return (
                            <button
                                key={token.id}
                                onClick={() => navigate(`/${token.ticker?.toLowerCase()}`, query)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                            >
                                {token.imageUrl ? (
                                    <img src={token.imageUrl} alt={token.ticker ?? ""} className="w-8 h-8 rounded-full object-cover shrink-0" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{token.ticker}</p>
                                    <p className="text-xs text-zinc-500 truncate">{token.name}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-medium text-white">{formatPrice(token.price)}</p>
                                    {token.change24h !== null && (
                                        <p className={cn("text-xs flex items-center justify-end gap-0.5", isUp ? "text-[#75ba80]" : "text-[#e07d6f]")}>
                                            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            {isUp ? "+" : ""}{token.change24h.toFixed(2)}%
                                        </p>
                                    )}
                                    {token.change24h === null && token.marketCap !== null && (
                                        <p className="text-xs text-zinc-500">{formatMarketCap(token.marketCap)}</p>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </section>
            )}

            {!isLoading && hasPosts && (
                <section>
                    <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Posts</p>
                    {data!.posts.map(post => (
                        <button
                            key={post.id}
                            onClick={() => navigate(`/search?q=${encodeURIComponent(query)}`, query)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                        >
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4 text-zinc-600" />
                            </div>
                            <p className="text-sm text-zinc-300 truncate">{post.content}</p>
                        </button>
                    ))}
                </section>
            )}

            {!isLoading && !isEmpty && (
                <button
                    onClick={() => navigate(`/search?q=${encodeURIComponent(query)}`, query)}
                    className="w-full flex items-center gap-2 px-4 py-3 border-t border-white/5 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                    <SearchIcon className="w-5 h-5" />
                    See all results for &ldquo;{query}&rdquo;
                </button>
            )}
        </div>
    );
}

function HistoryItem({ item, onSelect, onRemove }: { item: string; onSelect: () => void; onRemove: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            className="w-full cursor-pointer flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <button className="cursor-pointer flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onSelect}>
                <CircleTimeIcon className="w-5 h-5 text-zinc-500 shrink-0" />
                <span className="text-md font-semibold text-zinc-100 truncate">{item}</span>
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className={cn("p-1 cursor-pointer rounded-full hover:bg-white/10 text-zinc-500 hover:text-white transition-all shrink-0", hovered ? "opacity-100" : "opacity-0")}
            >
                <X className="w-4.5 h-4.5" />
            </button>
        </div>
    );
}
