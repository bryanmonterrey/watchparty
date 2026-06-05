"use client";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { UserX, Ban } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

export function BlockedList() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.moderation.getBlocked.useQuery();
    const unblock = trpc.moderation.unblock.useMutation({
        onSuccess: () => { utils.moderation.getBlocked.invalidate(); toast.success("Unblocked"); },
    });

    if (isLoading) return (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
    );

    if (!data?.length) return (
        <div className="text-center py-12 space-y-2">
            <Ban className="w-10 h-10 mx-auto text-zinc-700" />
            <p className="text-sm text-zinc-500">No blocked users</p>
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
                        <p className="text-xs text-zinc-500">@{u.username} · blocked {formatDistanceToNow(new Date(u.blockedAt))} ago</p>
                    </div>
                    <button
                        onClick={() => unblock.mutate({ userId: u.id })}
                        disabled={unblock.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 border border-white/15 hover:bg-white/5 transition-colors disabled:opacity-40"
                    >
                        Unblock
                    </button>
                </div>
            ))}
        </div>
    );
}
