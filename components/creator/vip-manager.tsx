"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Crown, UserPlus, X, Loader2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import { useDebounce } from "@/hooks/use-debounce";

export function VIPManager() {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id ?? "";
    const [search, setSearch] = useState("");
    const [showAdd, setShowAdd] = useState(false);
    const debouncedSearch = useDebounce(search, 300);
    const utils = trpc.useUtils();

    const { data: vips, isLoading } = trpc.creator.getVIPs.useQuery({ creatorId: userId }, { enabled: !!userId });
    const { data: searchResults } = trpc.user.search.useQuery({ query: debouncedSearch, limit: 10 }, { enabled: debouncedSearch.length >= 2 });

    const addVIP = trpc.creator.addVIP.useMutation({
        onSuccess: () => { toast.success("VIP added!"); utils.creator.getVIPs.invalidate(); setSearch(""); setShowAdd(false); },
        onError: (e) => toast.error(e.message),
    });
    const removeVIP = trpc.creator.removeVIP.useMutation({
        onSuccess: () => { toast.success("VIP removed"); utils.creator.getVIPs.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const vipIds = new Set(vips?.map(v => v.id) ?? []);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-amber-400" />
                    <h2 className="text-base font-bold text-zinc-100">VIP Members</h2>
                    <span className="text-xs text-zinc-500">({vips?.length ?? 0}/100)</span>
                </div>
                <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-sm text-zinc-300 transition-colors">
                    <UserPlus className="w-4 h-4" /> Add VIP
                </button>
            </div>

            {showAdd && (
                <div className="rounded-[20px] bg-panel p-3 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
                            className="h-[52px] w-full rounded-full bg-zinc-800 pl-9 pr-4 text-[16px] font-medium text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30" />
                    </div>
                    {searchResults?.users.filter(u => !vipIds.has(u.id) && u.id !== userId).map(u => (
                        <div key={u.id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg">
                            <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden shrink-0">
                                {u.avatar_url && <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-100 truncate">{u.name || u.username}</p>
                                <p className="text-xs text-zinc-500">@{u.username}</p>
                            </div>
                            <button onClick={() => addVIP.mutate({ memberId: u.id })} disabled={addVIP.isPending}
                                className="px-2 py-1 rounded-full bg-amber-400/20 text-amber-400 hover:bg-amber-400/30 text-xs font-bold transition-colors">
                                Add
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            ) : vips?.length === 0 ? (
                <div className="text-center py-10 text-zinc-600">
                    <Crown className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No VIP members yet</p>
                </div>
            ) : (
                <div className="space-y-1">
                    {vips?.map(v => (
                        <div key={v.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden shrink-0 ring-2 ring-amber-400/40">
                                {v.avatar_url && <img src={v.avatar_url} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <Link href={`/@${v.username}`} className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-zinc-100 truncate">{v.name || v.username}</p>
                                <p className="text-xs text-zinc-500">@{v.username}</p>
                            </Link>
                            <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <button onClick={() => removeVIP.mutate({ memberId: v.id })} disabled={removeVIP.isPending}
                                className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
