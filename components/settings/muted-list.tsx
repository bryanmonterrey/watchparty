"use client";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { VolumeX } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

export function MutedList() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.moderation.getMuted.useQuery();
    const unmute = trpc.moderation.unmute.useMutation({
        onSuccess: () => { utils.moderation.getMuted.invalidate(); toast.success("Unmuted"); },
    });

    if (isLoading) return (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
    );

    if (!data?.length) return (
        <div className="text-center py-12 space-y-2">
            <VolumeX className="w-10 h-10 mx-auto text-zinc-700" />
            <p className="text-sm text-zinc-500">No muted users</p>
        </div>
    );

    return (
        <div className="space-y-2">
            {data.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/10">
                    <Link href={`/${u.username}`}>
                        {u.avatar_url
                            ? <img src={u.avatar_url} className="w-10 h-10 rounded-full object-cover" />
                            : <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">{u.name?.[0]}</div>
                        }
                    </Link>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-200 truncate">{u.name}</p>
                        <p className="text-xs text-zinc-500">
                            @{u.username} · muted {formatDistanceToNow(new Date(u.mutedAt))} ago
                        </p>
                        <div className="flex gap-2 mt-0.5">
                            {u.muteNotifications && <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">Notifications</span>}
                            {u.muteStories && <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">Stories</span>}
                        </div>
                    </div>
                    <button
                        onClick={() => unmute.mutate({ userId: u.id })}
                        disabled={unmute.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 border border-white/15 hover:bg-white/5 transition-colors disabled:opacity-40"
                    >
                        Unmute
                    </button>
                </div>
            ))}
        </div>
    );
}
