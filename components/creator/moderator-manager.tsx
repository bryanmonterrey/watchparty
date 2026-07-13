"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Shield, UserPlus, X, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Link from "next/link";
import { useDebounce } from "@/hooks/use-debounce";

export function ModeratorManager() {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id ?? "";
    const [search, setSearch] = useState("");
    const [showAdd, setShowAdd] = useState(false);
    const debouncedSearch = useDebounce(search, 300);
    const utils = trpc.useUtils();

    const { data: mods, isLoading } = trpc.creator.getModerators.useQuery({ creatorId: userId }, { enabled: !!userId });
    const { data: searchResults } = trpc.user.search.useQuery({ query: debouncedSearch, limit: 10 }, { enabled: debouncedSearch.length >= 2 });

    const addMod = trpc.creator.addModerator.useMutation({
        onSuccess: () => { toast.success("Moderator added!"); utils.creator.getModerators.invalidate(); setSearch(""); setShowAdd(false); },
        onError: (e) => toast.error(e.message),
    });
    const removeMod = trpc.creator.removeModerator.useMutation({
        onSuccess: () => { toast.success("Moderator removed"); utils.creator.getModerators.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const modIds = new Set(mods?.map(m => m.id) ?? []);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-400" />
                    <h2 className="text-base font-bold text-zinc-100">Moderators</h2>
                    <span className="text-xs text-zinc-500">({mods?.length ?? 0}/10)</span>
                </div>
                <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-sm text-zinc-300 transition-colors">
                    <UserPlus className="w-4 h-4" /> Add Mod
                </button>
            </div>

            {showAdd && (
                <div className="rounded-[20px] bg-panel p-3 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
                            className="w-full pl-9 pr-4 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30" />
                    </div>
                    {searchResults?.users.filter(u => !modIds.has(u.id) && u.id !== userId).map(u => (
                        <div key={u.id} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg">
                            <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden shrink-0">
                                {u.avatar_url && <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-100 truncate">{u.name || u.username}</p>
                                <p className="text-xs text-zinc-500">@{u.username}</p>
                            </div>
                            <button onClick={() => addMod.mutate({ moderatorId: u.id })} disabled={addMod.isPending}
                                className="px-2 py-1 rounded-full bg-blue-400/20 text-blue-400 hover:bg-blue-400/30 text-xs font-bold transition-colors">
                                Add
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
            ) : mods?.length === 0 ? (
                <div className="text-center py-10 text-zinc-600">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No moderators yet</p>
                </div>
            ) : (
                <div className="space-y-1">
                    {mods?.map(m => (
                        <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden shrink-0 ring-2 ring-blue-400/40">
                                {m.avatar_url && <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <Link href={`/@${m.username}`} className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-zinc-100 truncate">{m.name || m.username}</p>
                                <p className="text-xs text-zinc-500">@{m.username}</p>
                            </Link>
                            <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <button onClick={() => removeMod.mutate({ moderatorId: m.id })} disabled={removeMod.isPending}
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
